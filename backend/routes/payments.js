const express = require('express');
const router = express.Router();

const { validatePaymentVerification } = require('../middleware/validation');
const firebaseService = require('../services/firebaseService');
const razorpayService = require('../services/razorpayService');
const cashfreeService = require('../services/cashfreeService');
const shiprocketService = require('../services/shiprocketService');
const whatsappService = require('../services/whatsappService');
const metaCapiService = require('../services/metaCapiService');
const { withLock } = require('../utils/idempotency');
const logger = require('../utils/logger');

/**
 * POST /api/payments/razorpay/verify
 * POST /api/payments/verify
 * Server-side Razorpay signature verification and Shiprocket booking trigger
 */
router.post(['/razorpay/verify', '/verify'], validatePaymentVerification, async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const reqOrderId = req.body.orderId || req.body.order_id || req.body.internalOrderId;

    // 1. Timing-safe HMAC SHA256 signature verification
    const isValidSignature = razorpayService.verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!isValidSignature) {
      logger.warn('PAYMENT_SIGNATURE_INVALID', { razorpay_order_id, razorpay_payment_id });
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Payment signature could not be verified.'
        }
      });
    }

    // 2. Instant O(1) internal order lookup by provided Order ID, with fallback to Razorpay Order ID
    let order = null;
    if (reqOrderId) {
      order = await firebaseService.getOrder(reqOrderId);
    }
    if (!order && razorpay_order_id) {
      order = await firebaseService.findOrderByRazorpayOrderId(razorpay_order_id);
    }

    if (!order) {
      logger.error('ORDER_NOT_FOUND_FOR_RAZORPAY_ID', { razorpay_order_id, reqOrderId });
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Associated internal order was not found.'
        }
      });
    }

    const orderId = order.orderId;

    // 3. Acquire Idempotency Lock for this order to prevent concurrent race conditions
    const updatedOrder = await withLock(`order_fulfillment_${orderId}`, async () => {
      const freshOrder = await firebaseService.getOrder(orderId);

      // Check if already captured & processed (Strict Idempotency Guard)
      if (freshOrder.payment && freshOrder.payment.status === 'CAPTURED') {
        logger.info('ORDER_ALREADY_CAPTURED_IDEMPOTENT', { orderId });
        return freshOrder;
      }

      const now = new Date().toISOString();

      if (!freshOrder.payment) freshOrder.payment = {};
      freshOrder.payment.provider = 'razorpay';
      freshOrder.payment.status = 'CAPTURED';
      freshOrder.payment.razorpayOrderId = razorpay_order_id || freshOrder.payment.razorpayOrderId;
      freshOrder.payment.razorpayPaymentId = razorpay_payment_id;
      freshOrder.payment.paidAt = now;
      freshOrder.paymentMethod = 'razorpay';
      freshOrder.status = 'PAYMENT_CAPTURED';

      if (!freshOrder.events) freshOrder.events = [];
      freshOrder.events.push({
        event: 'PAYMENT_CAPTURED',
        timestamp: now,
        details: `Razorpay payment ${razorpay_payment_id} verified and captured`
      });

      // Update payment and order status in Firebase
      await firebaseService.updateOrder(orderId, {
        payment: freshOrder.payment,
        paymentMethod: 'razorpay',
        status: 'PAYMENT_CAPTURED',
        events: freshOrder.events
      });


      // Trigger Order Confirmation WhatsApp message
      whatsappService.sendOrderConfirmationWhatsApp(freshOrder).catch(err => {
        logger.error('WHATSAPP_RAZORPAY_CONFIRM_FAIL', { orderId, error: err.message });
      });

      // Dispatch Meta Conversions API (CAPI) Purchase Event from Backend
      metaCapiService.sendEvent({
        eventName: 'Purchase',
        eventId: `ord_${orderId}`,
        eventSourceUrl: req.headers.referer || 'https://mantasha.store',
        userData: {
          name: freshOrder.customer?.name,
          phone: freshOrder.customer?.phone,
          city: freshOrder.customer?.city,
          state: freshOrder.customer?.state,
          zip: freshOrder.customer?.pincode,
          clientIp: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || req.ip,
          clientUserAgent: req.headers['user-agent']
        },
        customData: {
          currency: 'INR',
          value: freshOrder.pricing?.total || (freshOrder.payment?.amountPaise / 100),
          order_id: orderId,
          content_type: 'product',
          contents: freshOrder.items?.map(i => ({ id: i.productId, quantity: i.quantity, item_price: i.price }))
        }
      }).catch(err => {
        logger.error('META_CAPI_RAZORPAY_PURCHASE_FAIL', { orderId, error: err.message });
      });

      // 4. Do not auto-book courier. Shipping will be assigned manually by Admin via Shiprocket or Delhivery.
      if (!freshOrder.shipping) {
        freshOrder.shipping = {
          provider: null,
          status: 'NOT_BOOKED',
          awb: null,
          courierName: null,
          trackingUrl: null
        };
      }

      return freshOrder;
    });

    return res.json({
      success: true,
      message: 'Payment verified and order processed successfully.',
      data: {
        orderId: updatedOrder.orderId,
        status: updatedOrder.status,
        payment: {
          provider: 'razorpay',
          status: updatedOrder.payment.status,
          paidAt: updatedOrder.payment.paidAt
        },
        shipping: {
          provider: updatedOrder.shipping?.provider || null,
          status: updatedOrder.shipping?.status || 'NOT_BOOKED',
          awb: updatedOrder.shipping?.awb || null,
          courierName: updatedOrder.shipping?.courierName || null,
          trackingUrl: updatedOrder.shipping?.trackingUrl || null
        },
        pricing: updatedOrder.pricing,
        items: updatedOrder.items
      }
    });
  } catch (err) {
    if (err.code === 'CONCURRENT_REQUEST') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONCURRENT_OPERATION',
          message: 'This order is currently being processed. Please wait a moment.'
        }
      });
    }
    next(err);
  }
});

/**
 * POST /api/payments/cashfree/verify
 * Server-side Cashfree order verification and fulfillment trigger
 */
router.post('/cashfree/verify', async (req, res, next) => {
  try {
    const orderId = req.body.orderId || req.body.order_id;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'ORDER_ID_REQUIRED', message: 'Order ID is required.' }
      });
    }

    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Associated order was not found.' }
      });
    }

    // If already captured, return immediate success
    if (order.payment && order.payment.status === 'CAPTURED') {
      return res.json({
        success: true,
        message: 'Payment already verified.',
        data: order
      });
    }

    // Verify order status directly from Cashfree PG API
    const cfOrder = await cashfreeService.getOrder(orderId);
    if (!cfOrder) {
      return res.status(400).json({
        success: false,
        error: { code: 'CASHFREE_ORDER_NOT_FOUND', message: 'Order not found in Cashfree.' }
      });
    }

    if (cfOrder.order_status === 'PAID') {
      const payments = await cashfreeService.getOrderPayments(orderId);
      const successfulPayment = payments.find(p => p.payment_status === 'SUCCESS') || payments[0] || {};
      const now = new Date().toISOString();

      await withLock(`order_fulfillment_${orderId}`, async () => {
        const freshOrder = await firebaseService.getOrder(orderId);
        if (!freshOrder) return;
        if (freshOrder.payment?.status === 'CAPTURED') return;

        freshOrder.payment = {
          ...(freshOrder.payment || {}),
          provider: 'cashfree',
          status: 'CAPTURED',
          cfOrderId: cfOrder.cf_order_id,
          cfPaymentId: successfulPayment.cf_payment_id || null,
          paymentMethod: successfulPayment.payment_group || 'cashfree',
          paidAt: now
        };
        freshOrder.paymentMethod = 'cashfree';
        freshOrder.status = 'PAYMENT_CAPTURED';

        if (!freshOrder.events) freshOrder.events = [];
        freshOrder.events.push({
          event: 'PAYMENT_CAPTURED_VIA_CLIENT_VERIFY',
          timestamp: now,
          details: `Cashfree payment verified. CF Payment ID: ${successfulPayment.cf_payment_id || 'SUCCESS'}`
        });

        await firebaseService.updateOrder(orderId, {
          payment: freshOrder.payment,
          paymentMethod: 'cashfree',
          status: freshOrder.status,
          events: freshOrder.events
        });

        logger.info('CASHFREE_PAYMENT_VERIFIED_SUCCESS', {
          orderId,
          cfOrderId: cfOrder.cf_order_id,
          cfPaymentId: successfulPayment.cf_payment_id
        });

        // Trigger WhatsApp confirmation
        whatsappService.sendOrderConfirmationWhatsApp(freshOrder).catch(err => {
          logger.error('CASHFREE_WHATSAPP_CONFIRM_FAIL', { orderId, error: err.message });
        });
      });

      const updatedOrder = await firebaseService.getOrder(orderId);
      return res.json({
        success: true,
        message: 'Payment verified and order confirmed successfully!',
        data: updatedOrder
      });
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_PAID',
          message: `Order status is ${cfOrder.order_status}. Payment is not completed.`
        }
      });
    }
  } catch (err) {
    if (err.code === 'CONCURRENT_REQUEST') {
      return res.status(409).json({
        success: false,
        error: { code: 'CONCURRENT_OPERATION', message: 'Order is being processed. Please wait.' }
      });
    }
    logger.error('CASHFREE_VERIFICATION_ERROR', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: 'VERIFICATION_FAILED', message: err.message || 'Payment verification failed.' }
    });
  }
});

module.exports = router;

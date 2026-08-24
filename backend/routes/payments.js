const express = require('express');
const router = express.Router();

const { validatePaymentVerification } = require('../middleware/validation');
const firebaseService = require('../services/firebaseService');
const razorpayService = require('../services/razorpayService');
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

    // 2. Find internal order in database by Razorpay Order ID or provided Order ID
    let order = await firebaseService.findOrderByRazorpayOrderId(razorpay_order_id);
    if (!order && reqOrderId) {
      order = await firebaseService.getOrder(reqOrderId);
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

      // Check if already captured & shipped
      if (
        freshOrder.payment &&
        freshOrder.payment.status === 'CAPTURED' &&
        freshOrder.shipping &&
        ['BOOKED', 'AWB_ASSIGNED', 'SHIPPED', 'DELIVERED'].includes(freshOrder.shipping.status)
      ) {
        logger.info('ORDER_ALREADY_FULFILLED_IDEMPOTENT', { orderId });
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

      // 4. Book Shiprocket Shipment
      if (
        !freshOrder.shipping ||
        ['NOT_BOOKED', 'FAILED'].includes(freshOrder.shipping.status)
      ) {
        try {
          logger.info('TRIGGERING_SHIPROCKET_SHIPMENT', { orderId });
          const shipmentDetails = await shiprocketService.createShipment(freshOrder);

          freshOrder.shipping = {
            ...freshOrder.shipping,
            ...shipmentDetails
          };
          freshOrder.status = 'SHIPMENT_BOOKED';
          freshOrder.events.push({
            event: 'SHIPMENT_BOOKED',
            timestamp: new Date().toISOString(),
            details: `Shiprocket order booked with AWB ${shipmentDetails.awb}`
          });

          await firebaseService.updateOrder(orderId, {
            shipping: freshOrder.shipping,
            status: freshOrder.status,
            events: freshOrder.events
          });

          logger.info('SHIPMENT_BOOKED_SUCCESS', {
            orderId,
            awb: shipmentDetails.awb,
            courier: shipmentDetails.courierName
          });

          // Trigger Shipping Confirmation WhatsApp message
          whatsappService.sendShippingConfirmationWhatsApp(freshOrder).catch(err => {
            logger.error('WHATSAPP_RAZORPAY_SHIPPING_FAIL', { orderId, error: err.message });
          });
        } catch (shipErr) {
          logger.error('SHIPMENT_CREATION_FAILED_AFTER_PAYMENT', {
            orderId,
            error: shipErr.message
          });

          freshOrder.shipping.status = 'FAILED';
          freshOrder.events.push({
            event: 'SHIPMENT_FAILED',
            timestamp: new Date().toISOString(),
            details: `Shipping booking failed: ${shipErr.message}. Payment is safe.`
          });

          await firebaseService.updateOrder(orderId, {
            'shipping/status': 'FAILED',
            events: freshOrder.events
          });
        }
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
          provider: updatedOrder.shipping.provider,
          status: updatedOrder.shipping.status,
          awb: updatedOrder.shipping.awb,
          courierName: updatedOrder.shipping.courierName,
          trackingUrl: updatedOrder.shipping.trackingUrl
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

module.exports = router;

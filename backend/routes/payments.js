const express = require('express');
const router = express.Router();

const { validatePaymentVerification } = require('../middleware/validation');
const firebaseService = require('../services/firebaseService');
const razorpayService = require('../services/razorpayService');
const shiprocketService = require('../services/shiprocketService');
const whatsappService = require('../services/whatsappService');
const { withLock } = require('../utils/idempotency');
const logger = require('../utils/logger');

/**
 * POST /api/payments/razorpay/verify
 * Server-side Razorpay signature verification and Shiprocket booking trigger
 */
router.post('/razorpay/verify', validatePaymentVerification, async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

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

    // 2. Find internal order in database
    const order = await firebaseService.findOrderByRazorpayOrderId(razorpay_order_id);
    if (!order) {
      logger.error('ORDER_NOT_FOUND_FOR_RAZORPAY_ID', { razorpay_order_id });
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
        freshOrder.payment.status === 'CAPTURED' &&
        ['BOOKED', 'AWB_ASSIGNED', 'SHIPPED', 'DELIVERED'].includes(freshOrder.shipping.status)
      ) {
        logger.info('ORDER_ALREADY_FULFILLED_IDEMPOTENT', { orderId });
        return freshOrder;
      }

      const now = new Date().toISOString();

      // Update payment status
      const paymentUpdates = {
        'payment/status': 'CAPTURED',
        'payment/razorpayPaymentId': razorpay_payment_id,
        'payment/paidAt': now,
        status: 'PAYMENT_CAPTURED'
      };

      freshOrder.payment.status = 'CAPTURED';
      freshOrder.payment.razorpayPaymentId = razorpay_payment_id;
      freshOrder.payment.paidAt = now;
      freshOrder.status = 'PAYMENT_CAPTURED';

      if (!freshOrder.events) freshOrder.events = [];
      freshOrder.events.push({
        event: 'PAYMENT_CAPTURED',
        timestamp: now,
        details: `Razorpay payment ${razorpay_payment_id} verified and captured`
      });
      paymentUpdates.events = freshOrder.events;

      await firebaseService.updateOrder(orderId, paymentUpdates);

      // Trigger Order Confirmation WhatsApp message
      whatsappService.sendOrderConfirmationWhatsApp(freshOrder).catch(err => {
        logger.error('WHATSAPP_RAZORPAY_CONFIRM_FAIL', { orderId, error: err.message });
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

const express = require('express');
const router = express.Router();

const firebaseService = require('../services/firebaseService');
const razorpayService = require('../services/razorpayService');
const shiprocketService = require('../services/shiprocketService');
const config = require('../config/env');
const { withLock } = require('../utils/idempotency');
const logger = require('../utils/logger');

/**
 * POST /api/webhooks/razorpay
 * Razorpay Webhook Handler
 */
router.post('/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  // 1. Verify Webhook Signature (in development test mode, pass if secret not configured)
  const isDevTest = config.nodeEnv === 'development' && !signature;
  if (!isDevTest && !razorpayService.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('RAZORPAY_WEBHOOK_SIGNATURE_INVALID', { signature });
    return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
  }

  const payload = req.body;
  const eventId = payload.id || `rzp_evt_${Date.now()}`;
  const eventType = payload.event;

  logger.info('RAZORPAY_WEBHOOK_RECEIVED', { eventId, eventType });

  // 2. Check Idempotency
  const alreadyProcessed = await firebaseService.isWebhookEventProcessed('razorpay', eventId);
  if (alreadyProcessed) {
    logger.info('RAZORPAY_WEBHOOK_DUPLICATE_IGNORED', { eventId });
    return res.status(200).json({ success: true, message: 'Event already processed.' });
  }

  // 3. Mark event processed immediately to prevent duplicate arrival processing
  await firebaseService.markWebhookEventProcessed('razorpay', eventId, { eventType });

  // 4. Process event asynchronously / in background
  (async () => {
    try {
      if (['payment.captured', 'order.paid'].includes(eventType)) {
        const paymentEntity = (payload.payload && payload.payload.payment && payload.payload.payment.entity) || {};
        const razorpayOrderId = paymentEntity.order_id || (payload.payload && payload.payload.order && payload.payload.order.entity && payload.payload.order.entity.id);
        const razorpayPaymentId = paymentEntity.id;

        if (!razorpayOrderId) return;

        const order = await firebaseService.findOrderByRazorpayOrderId(razorpayOrderId);
        if (!order) {
          logger.warn('WEBHOOK_ORDER_NOT_FOUND', { razorpayOrderId });
          return;
        }

        const orderId = order.orderId;
        await withLock(`order_fulfillment_${orderId}`, async () => {
          const freshOrder = await firebaseService.getOrder(orderId);
          const now = new Date().toISOString();

          // Update Payment status if not captured
          if (freshOrder.payment.status !== 'CAPTURED') {
            freshOrder.payment.status = 'CAPTURED';
            freshOrder.payment.razorpayPaymentId = razorpayPaymentId;
            freshOrder.payment.paidAt = now;
            freshOrder.status = 'PAYMENT_CAPTURED';

            if (!freshOrder.events) freshOrder.events = [];
            freshOrder.events.push({
              event: 'PAYMENT_CAPTURED_VIA_WEBHOOK',
              timestamp: now,
              details: `Webhook confirmed payment ${razorpayPaymentId}`
            });

            await firebaseService.updateOrder(orderId, {
              payment: freshOrder.payment,
              status: freshOrder.status,
              events: freshOrder.events
            });
          }

          // Trigger Shiprocket booking if not yet booked
          if (
            !freshOrder.shipping ||
            ['NOT_BOOKED', 'FAILED'].includes(freshOrder.shipping.status)
          ) {
            try {
              const shipmentDetails = await shiprocketService.createShipment(freshOrder);
              freshOrder.shipping = {
                ...freshOrder.shipping,
                ...shipmentDetails
              };
              freshOrder.status = 'SHIPMENT_BOOKED';
              freshOrder.events.push({
                event: 'SHIPMENT_BOOKED_VIA_WEBHOOK',
                timestamp: new Date().toISOString(),
                details: `Shiprocket order booked with AWB ${shipmentDetails.awb}`
              });

              await firebaseService.updateOrder(orderId, {
                shipping: freshOrder.shipping,
                status: freshOrder.status,
                events: freshOrder.events
              });
            } catch (shipErr) {
              logger.error('WEBHOOK_SHIPMENT_BOOKING_FAILED', {
                orderId,
                error: shipErr.message
              });
              await firebaseService.updateOrder(orderId, {
                'shipping/status': 'FAILED'
              });
            }
          }
        });
      } else if (eventType === 'payment.failed') {
        const paymentEntity = (payload.payload && payload.payload.payment && payload.payload.payment.entity) || {};
        const razorpayOrderId = paymentEntity.order_id;
        if (razorpayOrderId) {
          const order = await firebaseService.findOrderByRazorpayOrderId(razorpayOrderId);
          if (order && order.payment.status !== 'CAPTURED') {
            await firebaseService.updateOrder(order.orderId, {
              'payment/status': 'FAILED',
              status: 'PAYMENT_FAILED'
            });
          }
        }
      }
    } catch (bgErr) {
      logger.error('RAZORPAY_WEBHOOK_BG_PROCESSING_ERROR', { error: bgErr.message });
    }
  })();

  // Return HTTP 200 immediately
  return res.status(200).json({ success: true, received: true });
});

/**
 * POST /api/webhooks/shiprocket
 * Shiprocket Tracking Webhook Handler
 */
router.post('/shiprocket', async (req, res) => {
  const token = req.headers['x-api-key'] || req.headers['security-token'];
  if (config.shiprocket.webhookSecret && token && token !== config.shiprocket.webhookSecret) {
    logger.warn('SHIPROCKET_WEBHOOK_AUTH_FAILED');
    return res.status(401).json({ success: false, error: 'Unauthorized webhook' });
  }

  const payload = req.body || {};
  const awb = payload.awb || payload.awb_code;
  const shipmentId = payload.shipment_id;
  const orderIdRef = payload.order_id;
  const currentStatus = (payload.current_status || payload.status || '').toUpperCase();
  const eventId = `sr_${awb || shipmentId || orderIdRef}_${currentStatus}_${payload.timestamp || Date.now()}`;

  logger.info('SHIPROCKET_WEBHOOK_RECEIVED', {
    awb,
    shipmentId,
    orderIdRef,
    currentStatus
  });

  // Check Idempotency
  const alreadyProcessed = await firebaseService.isWebhookEventProcessed('shiprocket', eventId);
  if (alreadyProcessed) {
    return res.status(200).json({ success: true, message: 'Event already processed.' });
  }

  await firebaseService.markWebhookEventProcessed('shiprocket', eventId, { currentStatus, payload });

  // Locate order
  (async () => {
    try {
      const order = await firebaseService.findOrderByShipmentIdentifier(awb || shipmentId || orderIdRef);
      if (!order) {
        logger.warn('SHIPROCKET_WEBHOOK_ORDER_NOT_FOUND', { awb, shipmentId, orderIdRef });
        return;
      }

      const now = new Date().toISOString();
      const updates = {
        'shipping/lastTrackingUpdate': now,
        'shipping/status': currentStatus || order.shipping.status
      };

      // Map shipping status to overall order status
      if (['PICKED UP', 'PICKED_UP', 'IN TRANSIT', 'IN_TRANSIT'].includes(currentStatus)) {
        updates['status'] = 'SHIPPED';
        updates['shipping/status'] = 'IN_TRANSIT';
      } else if (['OUT FOR DELIVERY', 'OUT_FOR_DELIVERY'].includes(currentStatus)) {
        updates['status'] = 'OUT_FOR_DELIVERY';
        updates['shipping/status'] = 'OUT_FOR_DELIVERY';
      } else if (['DELIVERED'].includes(currentStatus)) {
        updates['status'] = 'DELIVERED';
        updates['shipping/status'] = 'DELIVERED';
      } else if (['RTO INITIATED', 'RTO DELIVERED', 'RTO'].includes(currentStatus)) {
        updates['status'] = 'RTO';
        updates['shipping/status'] = 'RTO';
      } else if (['CANCELED', 'CANCELLED'].includes(currentStatus)) {
        updates['status'] = 'CANCELLED';
        updates['shipping/status'] = 'CANCELLED';
      }

      if (payload.courier_name) {
        updates['shipping/courierName'] = payload.courier_name;
      }

      if (!order.events) order.events = [];
      order.events.push({
        event: `SHIPROCKET_${currentStatus}`,
        timestamp: now,
        details: payload.location ? `Status: ${currentStatus} at ${payload.location}` : `Status update: ${currentStatus}`
      });
      updates.events = order.events;

      await firebaseService.updateOrder(order.orderId, updates);
      logger.info('SHIPROCKET_STATUS_UPDATED', { orderId: order.orderId, currentStatus });
    } catch (err) {
      logger.error('SHIPROCKET_WEBHOOK_UPDATE_ERROR', { error: err.message });
    }
  })();

  return res.status(200).json({ success: true, received: true });
});

module.exports = router;

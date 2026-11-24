const express = require('express');
const router = express.Router();

const firebaseService = require('../services/firebaseService');
const razorpayService = require('../services/razorpayService');
const cashfreeService = require('../services/cashfreeService');
const shiprocketService = require('../services/shiprocketService');
const whatsappService = require('../services/whatsappService');
const config = require('../config/env');
const { withLock } = require('../utils/idempotency');
const logger = require('../utils/logger');

/**
 * GET /api/webhooks/razorpay
 * Health & status check when opened in browser (GET request)
 */
router.get('/razorpay', (req, res) => {
  res.json({
    status: 'ACTIVE',
    endpoint: 'Razorpay Webhook Listener',
    allowedMethod: 'POST',
    message: 'Webhook endpoint is active and listening for Razorpay POST events.'
  });
});

/**
 * GET /api/webhooks/shiprocket
 * Health & status check when opened in browser (GET request)
 */
router.get('/shiprocket', (req, res) => {
  res.json({
    status: 'ACTIVE',
    endpoint: 'Shiprocket Webhook Listener',
    allowedMethod: 'POST',
    message: 'Webhook endpoint is active and listening for Shiprocket POST tracking events.'
  });
});

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
        const orderEntity = (payload.payload && payload.payload.order && payload.payload.order.entity) || {};
        const paymentEntity = (payload.payload && payload.payload.payment && payload.payload.payment.entity) || {};

        const razorpayOrderId = paymentEntity.order_id || orderEntity.id;
        const razorpayPaymentId = paymentEntity.id;

        // Instant O(1) direct internal Order ID extraction from receipt, notes, or description
        let internalOrderId = orderEntity.receipt ||
                              (orderEntity.notes && orderEntity.notes.internalOrderId) ||
                              (paymentEntity.notes && paymentEntity.notes.internalOrderId) ||
                              null;

        if (!internalOrderId && paymentEntity.description && paymentEntity.description.startsWith('Order #')) {
          internalOrderId = paymentEntity.description.replace('Order #', '').trim();
        }

        // 1. Direct O(1) Instant Firebase Lookup via internal Order ID (5ms)
        let order = null;
        if (internalOrderId) {
          order = await firebaseService.getOrder(internalOrderId);
          if (order) {
            logger.info('WEBHOOK_ORDER_FOUND_DIRECT_O1', { internalOrderId, razorpayOrderId, razorpayPaymentId });
          }
        }

        // 2. Fallback lookup via Razorpay Order ID if internalOrderId was missing or not found
        if (!order && razorpayOrderId) {
          order = await firebaseService.findOrderByRazorpayOrderId(razorpayOrderId);
        }

        if (!order) {
          logger.warn('WEBHOOK_ORDER_NOT_FOUND', { razorpayOrderId, internalOrderId, razorpayPaymentId });
          return;
        }

        const orderId = order.orderId;
        await withLock(`order_fulfillment_${orderId}`, async () => {
          const freshOrder = await firebaseService.getOrder(orderId);
          if (!freshOrder) return;
          const now = new Date().toISOString();

          if (!freshOrder.payment) freshOrder.payment = {};

          // Update Payment status if not captured
          if (freshOrder.payment.status !== 'CAPTURED') {
            freshOrder.payment.provider = 'razorpay';
            freshOrder.payment.status = 'CAPTURED';
            freshOrder.payment.razorpayOrderId = razorpayOrderId || freshOrder.payment.razorpayOrderId;
            freshOrder.payment.razorpayPaymentId = razorpayPaymentId || freshOrder.payment.razorpayPaymentId;
            freshOrder.payment.paidAt = now;
            freshOrder.paymentMethod = 'razorpay';
            freshOrder.status = 'PAYMENT_CAPTURED';

            if (!freshOrder.events) freshOrder.events = [];
            freshOrder.events.push({
              event: 'PAYMENT_CAPTURED_VIA_WEBHOOK',
              timestamp: now,
              details: `Webhook confirmed payment ${razorpayPaymentId}`
            });

            await firebaseService.updateOrder(orderId, {
              payment: freshOrder.payment,
              paymentMethod: 'razorpay',
              status: freshOrder.status,
              events: freshOrder.events
            });

            logger.info('WEBHOOK_ORDER_PAYMENT_CAPTURED_SUCCESS', {
              orderId,
              razorpayPaymentId,
              razorpayOrderId
            });

            whatsappService.sendOrderConfirmationWhatsApp(freshOrder).catch(err => {
              logger.error('WEBHOOK_WHATSAPP_CONFIRM_FAIL', { orderId, error: err.message });
            });
          }

          // Note: Courier is NOT auto-booked. Admin manually moves order to Shiprocket or Delhivery.
          if (!freshOrder.shipping) {
            freshOrder.shipping = {
              provider: null,
              status: 'NOT_BOOKED',
              awb: null,
              courierName: null,
              trackingUrl: null
            };
            await firebaseService.updateOrder(orderId, {
              shipping: freshOrder.shipping
            });
          }
        });
      } else if (eventType === 'payment.failed') {
        const orderEntity = (payload.payload && payload.payload.order && payload.payload.order.entity) || {};
        const paymentEntity = (payload.payload && payload.payload.payment && payload.payload.payment.entity) || {};

        const razorpayOrderId = paymentEntity.order_id || orderEntity.id;
        let internalOrderId = orderEntity.receipt ||
                              (orderEntity.notes && orderEntity.notes.internalOrderId) ||
                              (paymentEntity.notes && paymentEntity.notes.internalOrderId) ||
                              null;

        if (!internalOrderId && paymentEntity.description && paymentEntity.description.startsWith('Order #')) {
          internalOrderId = paymentEntity.description.replace('Order #', '').trim();
        }

        let order = null;
        if (internalOrderId) {
          order = await firebaseService.getOrder(internalOrderId);
        }
        if (!order && razorpayOrderId) {
          order = await firebaseService.findOrderByRazorpayOrderId(razorpayOrderId);
        }

        if (order && order.payment && order.payment.status !== 'CAPTURED') {
          await firebaseService.updateOrder(order.orderId, {
            'payment/status': 'FAILED',
            status: 'PAYMENT_FAILED'
          });
          logger.info('ORDER_PAYMENT_FAILED_WEBHOOK', { orderId: order.orderId, razorpayOrderId });
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

/**
 * GET /api/webhooks/cashfree
 * Status check
 */
router.get('/cashfree', (req, res) => {
  res.json({
    status: 'ACTIVE',
    provider: 'Cashfree',
    allowedMethod: 'POST',
    message: 'Cashfree webhook endpoint is active and listening for POST events.'
  });
});

/**
 * POST /api/webhooks/cashfree
 * Cashfree Webhook Handler (API version 2023-08-01)
 */
router.post('/cashfree', async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  // 1. Verify Webhook Signature (if signature provided)
  if (signature && timestamp && !cashfreeService.verifyWebhookSignature(rawBody, signature, timestamp)) {
    logger.warn('CASHFREE_WEBHOOK_SIGNATURE_INVALID', { signature, timestamp });
    return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
  }

  const payload = req.body || {};
  const eventType = payload.type || payload.event;
  const eventData = payload.data || {};
  const orderEntity = eventData.order || {};
  const paymentEntity = eventData.payment || {};

  const orderId = orderEntity.order_id || payload.order_id;
  const eventId = `cf_${orderId}_${eventType}_${timestamp || Date.now()}`;

  logger.info('CASHFREE_WEBHOOK_RECEIVED', { eventType, orderId, eventId });

  // 2. Check Idempotency
  const alreadyProcessed = await firebaseService.isWebhookEventProcessed('cashfree', eventId);
  if (alreadyProcessed) {
    logger.info('CASHFREE_WEBHOOK_DUPLICATE_IGNORED', { eventId });
    return res.status(200).json({ success: true, message: 'Event already processed.' });
  }

  await firebaseService.markWebhookEventProcessed('cashfree', eventId, { eventType });

  // 3. Process event asynchronously in background
  (async () => {
    try {
      if (!orderId) {
        logger.warn('CASHFREE_WEBHOOK_NO_ORDER_ID', { payload });
        return;
      }

      if (['PAYMENT_SUCCESS_WEBHOOK', 'ORDER_PAID', 'payment.success'].includes(eventType)) {
        await withLock(`order_fulfillment_${orderId}`, async () => {
          const freshOrder = await firebaseService.getOrder(orderId);
          if (!freshOrder) {
            logger.warn('CASHFREE_WEBHOOK_ORDER_NOT_FOUND', { orderId });
            return;
          }

          if (freshOrder.payment?.status !== 'CAPTURED') {
            const now = new Date().toISOString();
            freshOrder.payment = {
              ...(freshOrder.payment || {}),
              provider: 'cashfree',
              status: 'CAPTURED',
              cfOrderId: orderEntity.cf_order_id || freshOrder.payment?.cfOrderId,
              cfPaymentId: paymentEntity.cf_payment_id || freshOrder.payment?.cfPaymentId,
              paymentMethod: paymentEntity.payment_group || 'cashfree',
              paidAt: now
            };
            freshOrder.paymentMethod = 'cashfree';
            freshOrder.status = 'PAYMENT_CAPTURED';

            if (!freshOrder.events) freshOrder.events = [];
            freshOrder.events.push({
              event: 'PAYMENT_CAPTURED_VIA_WEBHOOK',
              timestamp: now,
              details: `Cashfree webhook confirmed payment: ${paymentEntity.cf_payment_id || 'SUCCESS'}`
            });

            await firebaseService.updateOrder(orderId, {
              payment: freshOrder.payment,
              paymentMethod: 'cashfree',
              status: freshOrder.status,
              events: freshOrder.events
            });

            logger.info('CASHFREE_WEBHOOK_ORDER_CAPTURED_SUCCESS', { orderId });

            whatsappService.sendOrderConfirmationWhatsApp(freshOrder).catch(err => {
              logger.error('CASHFREE_WEBHOOK_WHATSAPP_CONFIRM_FAIL', { orderId, error: err.message });
            });
          }
        });
      } else if (['PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED'].includes(eventType)) {
        const order = await firebaseService.getOrder(orderId);
        if (order && order.payment?.status !== 'CAPTURED') {
          await firebaseService.updateOrder(orderId, {
            'payment/status': 'FAILED',
            status: 'PAYMENT_FAILED'
          });
          logger.info('CASHFREE_ORDER_PAYMENT_FAILED_WEBHOOK', { orderId, eventType });
        }
      }
    } catch (err) {
      logger.error('CASHFREE_WEBHOOK_PROCESSING_ERROR', { error: err.message, orderId });
    }
  })();

  return res.status(200).json({ success: true, received: true });
});

module.exports = router;

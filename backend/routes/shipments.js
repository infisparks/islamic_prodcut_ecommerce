const express = require('express');
const router = express.Router();

const firebaseService = require('../services/firebaseService');
const shiprocketService = require('../services/shiprocketService');
const { withLock } = require('../utils/idempotency');
const logger = require('../utils/logger');

/**
 * GET /api/shipments/serviceability
 * Check if a 6-digit delivery pincode is serviceable
 */
router.get('/serviceability', async (req, res, next) => {
  try {
    const { pincode, cod, isCod, weight, weightKg } = req.query;
    if (!pincode) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PINCODE',
          message: 'Delivery pincode is required.'
        }
      });
    }

    const codFlag = isCod === 'true' || isCod === '1' || cod === 'true' || cod === '1';
    const parsedWeight = parseFloat(weightKg || weight) || 0.15;

    const result = await shiprocketService.checkServiceability(pincode, codFlag, parsedWeight);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shipments/create
 * Internal/Direct endpoint to book shipment for a verified order
 */
router.post('/create', async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORDER_ID',
          message: 'orderId is required.'
        }
      });
    }

    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order was not found.'
        }
      });
    }

    // Verify order is paid or COD
    const isPayable =
      (order.payment && order.payment.status === 'CAPTURED') ||
      (order.payment && order.payment.provider === 'COD');

    if (!isPayable) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ORDER_NOT_PAID',
          message: 'Cannot create shipment for unpaid order.'
        }
      });
    }

    const result = await withLock(`shipping_booking_${orderId}`, async () => {
      const freshOrder = await firebaseService.getOrder(orderId);
      if (
        freshOrder.shipping &&
        ['BOOKED', 'AWB_ASSIGNED', 'SHIPPED', 'DELIVERED'].includes(freshOrder.shipping.status)
      ) {
        return freshOrder.shipping;
      }

      const shippingDetails = await shiprocketService.createShipment(freshOrder);
      freshOrder.shipping = {
        ...freshOrder.shipping,
        ...shippingDetails
      };
      freshOrder.status = 'SHIPMENT_BOOKED';

      if (!freshOrder.events) freshOrder.events = [];
      freshOrder.events.push({
        event: 'SHIPMENT_BOOKED',
        timestamp: new Date().toISOString(),
        details: `Shiprocket shipment created with AWB ${shippingDetails.awb}`
      });

      await firebaseService.updateOrder(orderId, {
        shipping: freshOrder.shipping,
        status: freshOrder.status,
        events: freshOrder.events
      });

      return freshOrder.shipping;
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shipments/:orderId/retry
 * Retry shipping booking for an order whose shipping failed
 */
router.post('/:orderId/retry', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await firebaseService.getOrder(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order was not found.'
        }
      });
    }

    if (order.payment.status !== 'CAPTURED' && order.payment.provider !== 'COD') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ORDER_NOT_ELIGIBLE',
          message: 'Only captured or COD orders can be shipped.'
        }
      });
    }

    if (order.shipping && ['BOOKED', 'AWB_ASSIGNED', 'SHIPPED'].includes(order.shipping.status)) {
      return res.json({
        success: true,
        message: 'Order is already booked with courier.',
        data: order.shipping
      });
    }

    try {
      const shippingDetails = await shiprocketService.createShipment(order);
      order.shipping = {
        ...order.shipping,
        ...shippingDetails
      };
      order.status = 'SHIPMENT_BOOKED';

      if (!order.events) order.events = [];
      order.events.push({
        event: 'SHIPMENT_RETRY_SUCCESS',
        timestamp: new Date().toISOString(),
        details: `Shipment retry successful with AWB ${shippingDetails.awb}`
      });

      await firebaseService.updateOrder(orderId, {
        shipping: order.shipping,
        status: order.status,
        events: order.events
      });

      res.json({
        success: true,
        message: 'Shipment booked successfully on retry.',
        data: order.shipping
      });
    } catch (shipErr) {
      res.status(400).json({
        success: false,
        error: {
          code: 'SHIPROCKET_ERROR',
          message: shipErr.message || 'Shiprocket booking failed on retry.'
        }
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/shipments/:orderId/invoice
 * Fetch or redirect to official Shiprocket Tax Invoice PDF
 */
router.get('/:orderId/invoice', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { redirect } = req.query;
    const order = await firebaseService.getOrder(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order was not found.'
        }
      });
    }

    const srOrderId = order.shipping ? order.shipping.shiprocketOrderId : null;
    if (!srOrderId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SHIPMENT_NOT_CREATED',
          message: 'Tax invoice is not yet available because shipment has not been created.'
        }
      });
    }

    const result = await shiprocketService.generateTaxInvoice(srOrderId, order);

    if (redirect === 'true' || redirect === '1') {
      return res.redirect(result.invoiceUrl);
    }

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        shiprocketOrderId: srOrderId,
        invoiceUrl: result.invoiceUrl
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shipments/:orderId/cancel
 * Cancel shipment on Shiprocket and update order status in Firebase
 */
router.get('/:orderId/cancel', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await firebaseService.getOrder(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order was not found.'
        }
      });
    }

    const srOrderId = order.shipping ? order.shipping.shiprocketOrderId : null;
    let srResult = { success: true };
    if (srOrderId) {
      srResult = await shiprocketService.cancelOrder(srOrderId);
    }

    const events = order.events || [];
    events.push({
      event: 'SHIPMENT_CANCELLED',
      timestamp: new Date().toISOString(),
      details: `Shipment cancelled on Shiprocket API (ID: ${srOrderId || 'N/A'})`
    });

    await firebaseService.updateOrder(orderId, {
      status: 'CANCELLED',
      'shipping/status': 'CANCELLED',
      events
    });

    res.json({
      success: true,
      message: 'Shipment and order cancelled successfully.',
      data: srResult
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/shipments/:orderId/label
 * Fetch or redirect to official Shiprocket Shipping Label / Manifest PDF
 */
router.get('/:orderId/label', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { redirect } = req.query;
    const order = await firebaseService.getOrder(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order was not found.'
        }
      });
    }

    const srOrderId = order.shipping ? order.shipping.shiprocketOrderId : null;
    const shipmentId = order.shipping ? order.shipping.shipmentId : null;

    if (!srOrderId && !shipmentId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SHIPMENT_NOT_CREATED',
          message: 'Shipping label is not available because shipment has not been created.'
        }
      });
    }

    const result = await shiprocketService.generateShippingLabel(shipmentId, srOrderId);

    if (redirect === 'true' || redirect === '1') {
      return res.redirect(result.labelUrl);
    }

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        shiprocketOrderId: srOrderId,
        shipmentId: shipmentId,
        labelUrl: result.labelUrl
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

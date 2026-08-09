const express = require('express');
const router = express.Router();

const { validateOrderCreation } = require('../middleware/validation');
const { orderCreateLimiter } = require('../middleware/rateLimit');
const { buildTrustedOrderItems } = require('../services/catalogService');
const firebaseService = require('../services/firebaseService');
const razorpayService = require('../services/razorpayService');
const shiprocketService = require('../services/shiprocketService');
const { generateOrderId } = require('../utils/crypto');
const logger = require('../utils/logger');

/**
 * POST /api/orders/create
 * Creates a new order authoritatively from server catalog.
 */
router.post('/create', orderCreateLimiter, validateOrderCreation, async (req, res, next) => {
  try {
    const { customer, items, paymentMethod } = req.sanitizedOrder;

    // 1. Calculate trusted cart pricing, weights, dimensions
    const trustedOrderData = buildTrustedOrderItems(items);
    const internalOrderId = generateOrderId();
    const now = new Date().toISOString();

    const orderRecord = {
      orderId: internalOrderId,
      createdAt: now,
      status: paymentMethod === 'cod' ? 'COD_PENDING' : 'PENDING_PAYMENT',
      customer,
      items: trustedOrderData.items,
      pricing: trustedOrderData.pricing,
      package: trustedOrderData.package,
      inventoryStatus: trustedOrderData.inventoryStatus,
      payment: {
        provider: paymentMethod === 'cod' ? 'COD' : 'razorpay',
        status: paymentMethod === 'cod' ? 'COD_PENDING' : 'CREATED',
        amountPaise: trustedOrderData.pricing.total * 100,
        currency: 'INR',
        razorpayOrderId: null,
        razorpayPaymentId: null,
        paidAt: null
      },
      shipping: {
        provider: 'shiprocket',
        status: 'NOT_BOOKED',
        shiprocketOrderId: null,
        shipmentId: null,
        awb: null,
        courierName: null,
        trackingUrl: null,
        bookedAt: null,
        lastTrackingUpdate: null
      },
      events: [
        {
          event: 'ORDER_INITIATED',
          timestamp: now,
          details: `Order created via ${paymentMethod.toUpperCase()}`
        }
      ]
    };

    // 2. Handle Razorpay flow
    if (paymentMethod === 'razorpay') {
      const amountPaise = trustedOrderData.pricing.total * 100;

      const rzpOrder = await razorpayService.createOrder({
        internalOrderId,
        amountInPaise: amountPaise,
        currency: 'INR',
        customer
      });

      orderRecord.payment.razorpayOrderId = rzpOrder.id;
      orderRecord.status = 'PENDING_PAYMENT';

      await firebaseService.saveOrder(internalOrderId, orderRecord);
      logger.info('ORDER_CREATED', { internalOrderId, paymentMethod: 'razorpay', amountPaise });

      return res.status(201).json({
        success: true,
        data: {
          orderId: internalOrderId,
          razorpayOrderId: rzpOrder.id,
          razorpayKeyId: razorpayService.getKeyId(),
          amount: amountPaise,
          currency: 'INR',
          pricing: trustedOrderData.pricing,
          itemsCount: trustedOrderData.items.reduce((s, i) => s + i.quantity, 0)
        }
      });
    }

    // 3. Handle COD flow
    if (paymentMethod === 'cod') {
      logger.info('ORDER_CREATED_COD_INITIATED', { internalOrderId });

      // Automatically book Shiprocket for COD
      try {
        const shippingDetails = await shiprocketService.createShipment(orderRecord);
        orderRecord.shipping = {
          ...orderRecord.shipping,
          ...shippingDetails
        };
        orderRecord.status = 'SHIPMENT_BOOKED';
        orderRecord.events.push({
          event: 'SHIPMENT_BOOKED',
          timestamp: new Date().toISOString(),
          details: `Shiprocket shipment confirmed with Order ID ${shippingDetails.shiprocketOrderId}`
        });

        await firebaseService.saveOrder(internalOrderId, orderRecord);
        logger.info('ORDER_CREATED_COD_SUCCESS', { internalOrderId, shiprocketOrderId: shippingDetails.shiprocketOrderId });

        return res.status(201).json({
          success: true,
          data: {
            orderId: internalOrderId,
            status: orderRecord.status,
            payment: {
              provider: 'COD',
              status: 'COD_PENDING'
            },
            shipping: orderRecord.shipping,
            pricing: trustedOrderData.pricing,
            customer: orderRecord.customer
          }
        });
      } catch (shipErr) {
        logger.error('COD_SHIPMENT_FAILED', { internalOrderId, error: shipErr.message });
        orderRecord.shipping.status = 'FAILED';
        orderRecord.status = 'SHIPMENT_FAILED';
        orderRecord.events.push({
          event: 'SHIPMENT_FAILED',
          timestamp: new Date().toISOString(),
          details: `Shipping booking failed: ${shipErr.message}`
        });
        await firebaseService.saveOrder(internalOrderId, orderRecord);

        return res.status(400).json({
          success: false,
          error: {
            code: 'SHIPROCKET_CONFIRMATION_FAILED',
            message: shipErr.message || 'Shiprocket could not confirm shipment booking.'
          }
        });
      }
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:orderId
 * Retrieve full sanitized order data
 */
router.get('/:orderId', async (req, res, next) => {
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

    res.json({
      success: true,
      data: order
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:orderId/status
 * Retrieve order, payment, and shipping status summary
 */
router.get('/:orderId/status', async (req, res, next) => {
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

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.payment ? order.payment.status : 'UNKNOWN',
        shippingStatus: order.shipping ? order.shipping.status : 'NOT_BOOKED',
        awb: order.shipping ? order.shipping.awb : null,
        courierName: order.shipping ? order.shipping.courierName : null,
        trackingUrl: order.shipping ? order.shipping.trackingUrl : null
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const axios = require('axios');

const { verifyAdminAuth } = require('../middleware/adminAuth');
const firebaseService = require('../services/firebaseService');
const shiprocketService = require('../services/shiprocketService');
const config = require('../config/env');
const logger = require('../utils/logger');

// Protect all admin routes with Firebase Auth
router.use(verifyAdminAuth);

/**
 * Helper to fetch all orders from Firebase
 */
async function fetchAllOrders() {
  if (config.firebase.databaseSecret && config.firebase.databaseUrl) {
    try {
      const cleanBase = config.firebase.databaseUrl.replace(/\/$/, '');
      const url = `${cleanBase}/orders.json?auth=${config.firebase.databaseSecret}`;
      const res = await axios.get(url, { timeout: 10000 });
      if (res.data && typeof res.data === 'object') {
        return Object.values(res.data);
      }
    } catch (err) {
      logger.warn('ADMIN_FETCH_ORDERS_FALLBACK', { error: err.message });
    }
  }

  // Fallback to cache / service store
  const service = firebaseService;
  return Object.values(service.getOrder ? await getAllFromLocalOrDb() : []);
}

async function getAllFromLocalOrDb() {
  // Try local cached orders
  const orders = [];
  const snapshot = await firebaseService.getOrder('__non_existent__'); // Trigger internal load if any
  return orders;
}

/**
 * GET /api/admin/orders
 * Fetch all orders with search & status filters
 */
router.get('/orders', async (req, res, next) => {
  try {
    const { status, search, paymentProvider } = req.query;

    let orders = await fetchAllOrders();
    if (orders.length === 0) {
      // If REST returned empty or mock, fetch from firebaseService mockStore
      orders = Object.values(firebaseService._getMockStore ? firebaseService._getMockStore().orders : {});
    }

    // Filter by Order Status
    if (status && status !== 'all') {
      orders = orders.filter(o => (o.status || '').toUpperCase() === status.toUpperCase());
    }

    // Filter by Payment Provider (Razorpay, COD)
    if (paymentProvider && paymentProvider !== 'all') {
      orders = orders.filter(o => o.payment && (o.payment.provider || '').toLowerCase() === paymentProvider.toLowerCase());
    }

    // Search query (Order ID, Name, Phone, AWB)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      orders = orders.filter(o => {
        const orderId = (o.orderId || '').toLowerCase();
        const name = (o.customer && o.customer.name ? o.customer.name : '').toLowerCase();
        const phone = (o.customer && o.customer.phone ? o.customer.phone : '').toLowerCase();
        const awb = (o.shipping && o.shipping.awb ? o.shipping.awb : '').toLowerCase();
        const city = (o.customer && o.customer.city ? o.customer.city : '').toLowerCase();
        return orderId.includes(q) || name.includes(q) || phone.includes(q) || awb.includes(q) || city.includes(q);
      });
    }

    // Sort newest first
    orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({
      success: true,
      totalCount: orders.length,
      data: orders
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/stats
 * Aggregate dashboard metrics
 */
router.get('/stats', async (req, res, next) => {
  try {
    let orders = await fetchAllOrders();
    if (orders.length === 0) {
      orders = Object.values(firebaseService._getMockStore ? firebaseService._getMockStore().orders : {});
    }

    let totalRevenue = 0;
    let pendingCount = 0;
    let paidCount = 0;
    let shippedCount = 0;
    let cancelledCount = 0;
    let codCount = 0;

    for (const o of orders) {
      const orderStatus = (o.status || '').toUpperCase();
      const paymentStatus = o.payment ? (o.payment.status || '').toUpperCase() : '';
      const isPaid = paymentStatus === 'CAPTURED';

      if (isPaid && o.pricing && o.pricing.total) {
        totalRevenue += o.pricing.total;
      }

      if (['PENDING_PAYMENT', 'CREATED'].includes(orderStatus)) pendingCount++;
      if (['PAYMENT_CAPTURED', 'SHIPMENT_PENDING'].includes(orderStatus) || isPaid) paidCount++;
      if (['SHIPMENT_BOOKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(orderStatus)) shippedCount++;
      if (orderStatus === 'CANCELLED') cancelledCount++;
      if (o.payment && o.payment.provider === 'COD') codCount++;
    }

    res.json({
      success: true,
      data: {
        totalOrders: orders.length,
        totalRevenue,
        pendingCount,
        paidCount,
        shippedCount,
        cancelledCount,
        codCount
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/cancel
 * Cancel order directly from Admin dashboard
 */
router.post('/orders/:orderId/cancel', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

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

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';

    const events = order.events || [];
    events.push({
      event: 'ORDER_CANCELLED_BY_ADMIN',
      timestamp: now,
      details: `Order cancelled by ${adminEmail}. Reason: ${reason || 'Admin manual cancellation'}`
    });

    const updates = {
      status: 'CANCELLED',
      'shipping/status': 'CANCELLED',
      events
    };

    const updatedOrder = await firebaseService.updateOrder(orderId, updates);
    logger.info('ORDER_CANCELLED_BY_ADMIN', { orderId, adminEmail, reason });

    res.json({
      success: true,
      message: `Order ${orderId} has been successfully cancelled.`,
      data: updatedOrder
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/status
 * Manually update order or shipping status
 */
router.post('/orders/:orderId/status', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status, shippingStatus, notes } = req.body;

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

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';
    const events = order.events || [];

    events.push({
      event: 'STATUS_UPDATED_BY_ADMIN',
      timestamp: now,
      details: `Status set to [${status || order.status}] by ${adminEmail}. ${notes || ''}`
    });

    const updates = {
      events
    };

    if (status) updates.status = status.toUpperCase();
    if (shippingStatus) updates['shipping/status'] = shippingStatus.toUpperCase();

    const updatedOrder = await firebaseService.updateOrder(orderId, updates);

    res.json({
      success: true,
      message: `Order status updated to ${status || order.status}`,
      data: updatedOrder
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/retry-shipping
 * Retry booking Shiprocket shipment
 */
router.post('/orders/:orderId/retry-shipping', async (req, res, next) => {
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

    const shipmentDetails = await shiprocketService.createShipment(order);
    const now = new Date().toISOString();
    const events = order.events || [];

    events.push({
      event: 'SHIPMENT_RETRY_BY_ADMIN',
      timestamp: now,
      details: `Shipment booked by admin with AWB ${shipmentDetails.awb}`
    });

    const updatedOrder = await firebaseService.updateOrder(orderId, {
      shipping: {
        ...order.shipping,
        ...shipmentDetails
      },
      status: 'SHIPMENT_BOOKED',
      events
    });

    res.json({
      success: true,
      message: 'Shipment created successfully.',
      data: updatedOrder
    });
  } catch (err) {
    logger.error('ADMIN_RETRY_SHIPPING_FAILED', { orderId: req.params.orderId, error: err.message });
    return res.status(400).json({
      success: false,
      error: {
        code: 'SHIPROCKET_BOOKING_FAILED',
        message: err.message || 'Shiprocket shipment retry failed.'
      }
    });
  }
});

module.exports = router;

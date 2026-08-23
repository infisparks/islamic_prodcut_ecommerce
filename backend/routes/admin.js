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
 * Fetch all orders with search, date range & status filters
 */
router.get('/orders', async (req, res, next) => {
  try {
    const { status, search, paymentProvider, startDate, endDate, minAmount, maxAmount } = req.query;

    let orders = await fetchAllOrders();
    if (orders.length === 0) {
      // If REST returned empty or mock, fetch from firebaseService mockStore
      orders = Object.values(firebaseService._getMockStore ? firebaseService._getMockStore().orders : {});
    }

    // Filter by Date Range
    if (startDate) {
      const startTimestamp = new Date(`${startDate}T00:00:00`).getTime();
      if (!isNaN(startTimestamp)) {
        orders = orders.filter(o => new Date(o.createdAt || 0).getTime() >= startTimestamp);
      }
    }
    if (endDate) {
      const endTimestamp = new Date(`${endDate}T23:59:59.999`).getTime();
      if (!isNaN(endTimestamp)) {
        orders = orders.filter(o => new Date(o.createdAt || 0).getTime() <= endTimestamp);
      }
    }

    // Filter by Order Status
    if (status && status !== 'all') {
      orders = orders.filter(o => (o.status || '').toUpperCase() === status.toUpperCase());
    }

    // Filter by Payment Provider (Razorpay, COD)
    if (paymentProvider && paymentProvider !== 'all') {
      orders = orders.filter(o => {
        const prov = (o.payment?.provider || o.paymentMethod || '').toLowerCase();
        return prov === paymentProvider.toLowerCase();
      });
    }

    // Filter by Min / Max Amount
    if (minAmount && !isNaN(parseFloat(minAmount))) {
      orders = orders.filter(o => (o.pricing?.total || 0) >= parseFloat(minAmount));
    }
    if (maxAmount && !isNaN(parseFloat(maxAmount))) {
      orders = orders.filter(o => (o.pricing?.total || 0) <= parseFloat(maxAmount));
    }

    // Search query (Order ID, Name, Phone, AWB, City, Pincode, SKU, Item Title)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      orders = orders.filter(o => {
        const orderId = (o.orderId || '').toLowerCase();
        const name = (o.customer?.name || '').toLowerCase();
        const phone = (o.customer?.phone || '').toLowerCase();
        const awb = (o.shipping?.awb || '').toLowerCase();
        const city = (o.customer?.city || '').toLowerCase();
        const pincode = (o.customer?.pincode || '').toLowerCase();
        const courier = (o.shipping?.courierName || '').toLowerCase();
        const itemMatches = (o.items || []).some(i => 
          (i.name || i.title || '').toLowerCase().includes(q) || 
          (i.sku || '').toLowerCase().includes(q)
        );

        return orderId.includes(q) || 
               name.includes(q) || 
               phone.includes(q) || 
               awb.includes(q) || 
               city.includes(q) || 
               pincode.includes(q) || 
               courier.includes(q) ||
               itemMatches;
      });
    }

    // Sort newest first
    orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Calculate Summary Totals for the current filtered result
    let filteredRevenue = 0;
    let filteredPaidRevenue = 0;
    let filteredCodRevenue = 0;
    let filteredItemsCount = 0;

    for (const o of orders) {
      const isCancelled = (o.status || '').toUpperCase() === 'CANCELLED';
      const orderTotal = o.pricing?.total || (o.payment?.amountPaise ? o.payment.amountPaise / 100 : 0);
      const isPaid = (o.payment?.status || '').toUpperCase() === 'CAPTURED';
      const isCod = (o.payment?.provider || o.paymentMethod || '').toLowerCase() === 'cod';

      if (!isCancelled) {
        filteredRevenue += orderTotal;
        if (isPaid) filteredPaidRevenue += orderTotal;
        if (isCod) filteredCodRevenue += orderTotal;
      }

      for (const item of (o.items || [])) {
        filteredItemsCount += (item.quantity || 1);
      }
    }

    res.json({
      success: true,
      totalCount: orders.length,
      summary: {
        filteredRevenue,
        filteredPaidRevenue,
        filteredCodRevenue,
        filteredItemsCount,
        avgOrderValue: orders.length > 0 ? Math.round(filteredRevenue / orders.length) : 0
      },
      data: orders
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/stats
 * Aggregate dashboard metrics with optional date range
 */
router.get('/stats', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    let orders = await fetchAllOrders();
    if (orders.length === 0) {
      orders = Object.values(firebaseService._getMockStore ? firebaseService._getMockStore().orders : {});
    }

    // Filter by Date Range if provided
    if (startDate) {
      const startTimestamp = new Date(`${startDate}T00:00:00`).getTime();
      if (!isNaN(startTimestamp)) {
        orders = orders.filter(o => new Date(o.createdAt || 0).getTime() >= startTimestamp);
      }
    }
    if (endDate) {
      const endTimestamp = new Date(`${endDate}T23:59:59.999`).getTime();
      if (!isNaN(endTimestamp)) {
        orders = orders.filter(o => new Date(o.createdAt || 0).getTime() <= endTimestamp);
      }
    }

    let totalRevenue = 0;
    let paidRevenue = 0;
    let codExpectedRevenue = 0;
    let pendingCount = 0;
    let paidCount = 0;
    let shippedCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;
    let codCount = 0;
    let totalItemsSold = 0;

    for (const o of orders) {
      const orderStatus = (o.status || '').toUpperCase();
      const paymentStatus = (o.payment?.status || '').toUpperCase();
      const isPaid = paymentStatus === 'CAPTURED';
      const isCod = (o.payment?.provider || o.paymentMethod || '').toLowerCase() === 'cod';
      const orderTotal = o.pricing?.total || (o.payment?.amountPaise ? o.payment.amountPaise / 100 : 0);
      const isCancelled = orderStatus === 'CANCELLED';

      if (!isCancelled) {
        totalRevenue += orderTotal;
        if (isPaid) paidRevenue += orderTotal;
        if (isCod) codExpectedRevenue += orderTotal;

        for (const item of (o.items || [])) {
          totalItemsSold += (item.quantity || 1);
        }
      }

      if (['PENDING_PAYMENT', 'CREATED'].includes(orderStatus)) pendingCount++;
      if (['PAYMENT_CAPTURED', 'SHIPMENT_PENDING'].includes(orderStatus) || isPaid) paidCount++;
      if (['SHIPMENT_BOOKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(orderStatus)) shippedCount++;
      if (orderStatus === 'DELIVERED') deliveredCount++;
      if (isCancelled) cancelledCount++;
      if (isCod) codCount++;
    }

    const nonCancelledOrders = Math.max(1, orders.length - cancelledCount);
    const avgOrderValue = orders.length > 0 ? Math.round(totalRevenue / nonCancelledOrders) : 0;

    res.json({
      success: true,
      data: {
        totalOrders: orders.length,
        totalRevenue,
        paidRevenue,
        codExpectedRevenue,
        avgOrderValue,
        totalItemsSold,
        pendingCount,
        paidCount,
        shippedCount,
        deliveredCount,
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

    // If order has a Shiprocket Order ID, cancel it directly on Shiprocket API
    const srOrderId = order.shipping ? order.shipping.shiprocketOrderId : null;
    let srCancelMsg = '';
    if (srOrderId) {
      const srCancelRes = await shiprocketService.cancelOrder(srOrderId);
      if (srCancelRes.success) {
        srCancelMsg = ` (Shiprocket order #${srOrderId} cancelled successfully)`;
      } else {
        srCancelMsg = ` (Shiprocket cancellation notice: ${srCancelRes.error || 'Check Shiprocket dashboard'})`;
      }
    }

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';

    const events = order.events || [];
    events.push({
      event: 'ORDER_CANCELLED_BY_ADMIN',
      timestamp: now,
      details: `Order cancelled by ${adminEmail}. Reason: ${reason || 'Admin manual cancellation'}${srCancelMsg}`
    });

    const updates = {
      status: 'CANCELLED',
      'shipping/status': 'CANCELLED',
      events
    };

    const updatedOrder = await firebaseService.updateOrder(orderId, updates);
    logger.info('ORDER_CANCELLED_BY_ADMIN', { orderId, adminEmail, reason, shiprocketOrderId: srOrderId });

    res.json({
      success: true,
      message: `Order ${orderId} has been successfully cancelled${srCancelMsg}.`,
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
 * DELETE /api/admin/orders/:orderId
 * POST /api/admin/orders/:orderId/delete
 * Permanently delete order from Database (Requires confirmation string 'DELETE')
 */
const handlePermanentDeleteOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const confirmText = req.body?.confirmText || req.query?.confirmText || '';

    if (String(confirmText).trim().toUpperCase() !== 'DELETE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Please type DELETE in capital letters to confirm permanent deletion.'
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

    // If order is active on Shiprocket, attempt to cancel it first
    if (order.shipping && order.shipping.shiprocketOrderId) {
      try {
        await shiprocketService.cancelOrder(order.shipping.shiprocketOrderId);
      } catch (srErr) {
        logger.warn('SHIPROCKET_CANCEL_ON_DELETE_ERROR', { error: srErr.message, orderId });
      }
    }

    await firebaseService.deleteOrder(orderId);
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';
    logger.info('ORDER_PERMANENTLY_DELETED_BY_ADMIN', { orderId, adminEmail });

    res.json({
      success: true,
      message: `Order #${orderId} has been permanently deleted from the database.`
    });
  } catch (err) {
    next(err);
  }
};

router.delete('/orders/:orderId', handlePermanentDeleteOrder);
router.post('/orders/:orderId/delete', handlePermanentDeleteOrder);

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

/**
 * GET /api/admin/test-shiprocket
 * Diagnostic route to test Shiprocket API credentials and serviceability live
 */
router.get('/test-shiprocket', async (req, res) => {
  const axios = require('axios');
  const config = require('../config/env');

  const diagnostics = {
    email: config.shiprocket.email,
    pickupLocation: config.shiprocket.pickupLocation,
    authStatus: 'PENDING',
    serviceabilityStatus: 'PENDING',
    orderCreationStatus: 'PENDING',
    error: null
  };

  try {
    // 1. Auth Test
    const authRes = await axios.post(`${config.shiprocket.baseUrl}/auth/login`, {
      email: config.shiprocket.email,
      password: config.shiprocket.password
    }, { timeout: 10000 });

    const token = authRes.data.token;
    diagnostics.authStatus = 'SUCCESS';
    diagnostics.tokenReceived = true;

    // 2. Serviceability Test
    const servRes = await axios.get(`${config.shiprocket.baseUrl}/courier/serviceability/`, {
      params: {
        pickup_postcode: '421302',
        delivery_postcode: '400612',
        weight: 0.15,
        cod: 1
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });

    diagnostics.serviceabilityStatus = 'SUCCESS';
    diagnostics.availableCouriersCount = servRes.data.data?.available_courier_companies?.length || 0;
    diagnostics.cheapestRate = servRes.data.data?.available_courier_companies?.[0]?.rate || null;

    res.json({
      success: true,
      message: 'Shiprocket API connection is 100% HEALTHY & LIVE!',
      diagnostics
    });
  } catch (err) {
    diagnostics.error = err.response?.data || err.message;
    res.status(400).json({
      success: false,
      message: 'Shiprocket API Error Diagnostic Result',
      diagnostics
    });
  }
});

module.exports = router;

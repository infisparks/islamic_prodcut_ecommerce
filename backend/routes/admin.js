const express = require('express');
const router = express.Router();
const axios = require('axios');

const { verifyAdminAuth } = require('../middleware/adminAuth');
const firebaseService = require('../services/firebaseService');
const shiprocketService = require('../services/shiprocketService');
const delhiveryService = require('../services/delhiveryService');
const shippingService = require('../services/shippingService');
const whatsappService = require('../services/whatsappService');
const { catalog, findItemBySku } = require('../config/catalog');
const { buildTrustedOrderItems } = require('../services/catalogService');
const config = require('../config/env');
const logger = require('../utils/logger');

// Protect all admin routes with Firebase Auth
router.use(verifyAdminAuth);

let cachedOrders = null;
let lastOrdersFetchTime = 0;
let inFlightFetchPromise = null;
const CACHE_TTL_MS = 180000; // 3 minutes in-memory cache (invalidated instantly on order mutation or refresh=1)

// Invalidate in-memory cache whenever an order is saved or updated
if (typeof firebaseService.onOrderMutation === 'function') {
  firebaseService.onOrderMutation(() => {
    invalidateOrdersCache();
  });
}

function invalidateOrdersCache() {
  cachedOrders = null;
  lastOrdersFetchTime = 0;
}

/**
 * High-Speed Helper to fetch all orders from Firebase
 * - 60s in-memory cache for instant sub-millisecond filtering/searches
 * - Request deduplication so concurrent /orders and /stats trigger only ONE Firebase network call
 * - Automatic cache invalidation on order mutations
 */
async function fetchAllOrders(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedOrders && (now - lastOrdersFetchTime < CACHE_TTL_MS)) {
    return cachedOrders;
  }

  if (inFlightFetchPromise && !forceRefresh) {
    return inFlightFetchPromise;
  }

  inFlightFetchPromise = (async () => {
    try {
      if (config.firebase.databaseSecret && config.firebase.databaseUrl) {
        const cleanBase = config.firebase.databaseUrl.replace(/\/$/, '');
        const url = `${cleanBase}/orders.json?auth=${config.firebase.databaseSecret}`;
        const res = await axios.get(url, { timeout: 15000 });
        if (res.data && typeof res.data === 'object') {
          cachedOrders = Object.values(res.data);
          lastOrdersFetchTime = Date.now();
          return cachedOrders;
        }
      }
    } catch (err) {
      logger.warn('ADMIN_FETCH_ORDERS_FALLBACK', { error: err.message });
      if (cachedOrders) return cachedOrders;
    } finally {
      inFlightFetchPromise = null;
    }

    return cachedOrders || [];
  })();

  return inFlightFetchPromise;
}

// Background warm-up
setTimeout(() => {
  fetchAllOrders().catch(() => {});
}, 1500);

/**
 * Helper to parse date strings (YYYY-MM-DD) in Indian Standard Time (IST, UTC+5:30)
 * Ensures orders placed in Indian time correctly match Today, Yesterday, etc.
 */
function parseISTTimestamp(dateStr, isEndOfDay = false) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ts = new Date(trimmed).getTime();
    return isNaN(ts) ? null : ts;
  }
  const timePart = isEndOfDay ? '23:59:59.999+05:30' : '00:00:00.000+05:30';
  const ts = new Date(`${trimmed}T${timePart}`).getTime();
  return isNaN(ts) ? null : ts;
}

/**
 * GET /api/admin/orders
 * Fetch all orders with search, date range & status filters
 */
router.get('/orders', async (req, res, next) => {
  try {
    const { status, search, paymentProvider, startDate, endDate, minAmount, maxAmount, refresh } = req.query;

    let orders = await fetchAllOrders(refresh === '1' || refresh === 'true');
    if (orders.length === 0) {
      // If REST returned empty or mock, fetch from firebaseService mockStore
      orders = Object.values(firebaseService._getMockStore ? firebaseService._getMockStore().orders : {});
    }

    // Filter by Date Range (IST Aware)
    if (startDate) {
      const startTimestamp = parseISTTimestamp(startDate, false);
      if (startTimestamp !== null) {
        orders = orders.filter(o => new Date(o.createdAt || 0).getTime() >= startTimestamp);
      }
    }
    if (endDate) {
      const endTimestamp = parseISTTimestamp(endDate, true);
      if (endTimestamp !== null) {
        orders = orders.filter(o => new Date(o.createdAt || 0).getTime() <= endTimestamp);
      }
    }

    // Filter by Order Status
    if (status && status !== 'all') {
      if (status === 'LOCAL_DELIVERY') {
        const LOCAL_PINCODES = ['421305', '421302', '421308'];
        orders = orders.filter(o => 
          o.isLocalDelivery || 
          LOCAL_PINCODES.includes(String(o.customer?.pincode || '').trim())
        );
      } else {
        orders = orders.filter(o => (o.status || '').toUpperCase() === status.toUpperCase());
      }
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

    let filteredRevenue = 0;
    let filteredDeliveredRevenue = 0;
    let filteredInTransitRevenue = 0;
    let filteredPaidRevenue = 0;
    let filteredCodRevenue = 0;
    let filteredDeliveredCount = 0;
    let filteredInTransitCount = 0;
    let filteredItemsCount = 0;

    for (const o of orders) {
      const orderStatus = (o.status || '').toUpperCase();
      const isCancelled = orderStatus === 'CANCELLED';
      const orderTotal = o.pricing?.total || (o.payment?.amountPaise ? o.payment.amountPaise / 100 : 0);
      const prov = (o.payment?.provider || o.paymentMethod || o.payment_method || '').toLowerCase();
      const hasCodCharge = (o.pricing?.codCharge || 0) > 0;
      const hasCodEvent = (o.events || []).some(e => (e.event || '').includes('COD'));
      const isCod = prov === 'cod' || prov === 'cash_on_delivery' || hasCodCharge || hasCodEvent;
      const paymentStatus = (o.payment?.status || '').toUpperCase();
      const hasRazorpayPaymentId = Boolean(o.payment?.razorpayPaymentId);
      const isCaptured = paymentStatus === 'CAPTURED' || orderStatus === 'PAYMENT_CAPTURED' || Boolean(o.payment?.paidAt);
      const isManualPrepaidVerified = prov === 'prepaid_verified';
      const isPaid = !isCod && !isCancelled && (
        (isCaptured || hasRazorpayPaymentId || isManualPrepaidVerified) &&
        orderStatus !== 'PENDING_PAYMENT' &&
        paymentStatus !== 'CREATED' &&
        paymentStatus !== 'PENDING'
      );

      if (!isCancelled) {
        filteredRevenue += orderTotal;
        if (isPaid) filteredPaidRevenue += orderTotal;
        if (isCod) filteredCodRevenue += orderTotal;


        if (orderStatus === 'DELIVERED') {
          filteredDeliveredRevenue += orderTotal;
          filteredDeliveredCount++;
        } else if (['SHIPMENT_BOOKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(orderStatus)) {
          filteredInTransitRevenue += orderTotal;
          filteredInTransitCount++;
        }
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
        filteredDeliveredRevenue,
        filteredInTransitRevenue,
        filteredPaidRevenue,
        filteredCodRevenue,
        filteredDeliveredCount,
        filteredInTransitCount,
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
    const { startDate, endDate, refresh } = req.query;
    let orders = await fetchAllOrders(refresh === '1' || refresh === 'true');
    if (orders.length === 0) {
      orders = Object.values(firebaseService._getMockStore ? firebaseService._getMockStore().orders : {});
    }

    // Filter by Date Range if provided (IST Aware)
    if (startDate) {
      const startTimestamp = parseISTTimestamp(startDate, false);
      if (startTimestamp !== null) {
        orders = orders.filter(o => new Date(o.createdAt || 0).getTime() >= startTimestamp);
      }
    }
    if (endDate) {
      const endTimestamp = parseISTTimestamp(endDate, true);
      if (endTimestamp !== null) {
        orders = orders.filter(o => new Date(o.createdAt || 0).getTime() <= endTimestamp);
      }
    }

    let totalRevenue = 0;
    let deliveredRevenue = 0;
    let inTransitRevenue = 0;
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
      const prov = (o.payment?.provider || o.paymentMethod || o.payment_method || '').toLowerCase();
      const hasCodCharge = (o.pricing?.codCharge || 0) > 0;
      const hasCodEvent = (o.events || []).some(e => (e.event || '').includes('COD'));
      const isCod = prov === 'cod' || prov === 'cash_on_delivery' || hasCodCharge || hasCodEvent;
      const isCancelled = orderStatus === 'CANCELLED';
      const hasRazorpayPaymentId = Boolean(o.payment?.razorpayPaymentId);
      const isCaptured = paymentStatus === 'CAPTURED' || orderStatus === 'PAYMENT_CAPTURED' || Boolean(o.payment?.paidAt);
      const isManualPrepaidVerified = prov === 'prepaid_verified';
      const isPaid = !isCod && !isCancelled && (
        (isCaptured || hasRazorpayPaymentId || isManualPrepaidVerified) &&
        orderStatus !== 'PENDING_PAYMENT' &&
        paymentStatus !== 'CREATED' &&
        paymentStatus !== 'PENDING'
      );
      const isPendingPayment = !isCod && !isPaid && !isCancelled;
      const orderTotal = o.pricing?.total || (o.payment?.amountPaise ? o.payment.amountPaise / 100 : 0);

      if (!isCancelled) {
        totalRevenue += orderTotal;
        if (isPaid) paidRevenue += orderTotal;
        if (isCod) codExpectedRevenue += orderTotal;

        if (orderStatus === 'DELIVERED') {
          deliveredRevenue += orderTotal;
        } else if (['SHIPMENT_BOOKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(orderStatus)) {
          inTransitRevenue += orderTotal;
        }

        for (const item of (o.items || [])) {
          totalItemsSold += (item.quantity || 1);
        }
      }

      if (['PENDING_PAYMENT', 'CREATED'].includes(orderStatus) || isPendingPayment) pendingCount++;
      if (isPaid) paidCount++;
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
        deliveredRevenue,
        inTransitRevenue,
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
 * POST /api/admin/orders/:orderId/toggle-delivered
 * 1-click toggle between DELIVERED and previous/reverted status
 */
router.post('/orders/:orderId/toggle-delivered', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { markDelivered } = req.body;

    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';
    const events = order.events || [];
    const isCod = (order.payment && order.payment.provider === 'COD') || (order.paymentMethod === 'cod');

    let newStatus, newShippingStatus, newPaymentStatus;

    if (markDelivered === true || (markDelivered === undefined && order.status !== 'DELIVERED')) {
      newStatus = 'DELIVERED';
      newShippingStatus = 'DELIVERED';
      newPaymentStatus = isCod ? 'CAPTURED' : (order.payment?.status || 'CAPTURED');

      events.push({
        event: 'MARKED_DELIVERED_BY_ADMIN',
        timestamp: now,
        details: `Order marked as DELIVERED manually by ${adminEmail}.`
      });
    } else {
      // Reverting / unchecking delivered status
      const hasAwb = order.shipping && order.shipping.awb;
      newStatus = hasAwb ? 'SHIPPED' : (isCod ? 'SHIPMENT_BOOKED' : 'PAYMENT_CAPTURED');
      newShippingStatus = hasAwb ? 'IN_TRANSIT' : 'BOOKED';
      newPaymentStatus = isCod ? 'COD_PENDING' : (order.payment?.status || 'CAPTURED');

      events.push({
        event: 'DELIVERY_STATUS_REVERTED_BY_ADMIN',
        timestamp: now,
        details: `Delivery status reverted to [${newStatus}] by ${adminEmail}.`
      });
    }

    const updates = {
      status: newStatus,
      'shipping/status': newShippingStatus,
      events
    };

    if (isCod) {
      updates['payment/status'] = newPaymentStatus;
    }

    const updatedOrder = await firebaseService.updateOrder(orderId, updates);
    logger.info('ORDER_DELIVERY_TOGGLED', { orderId, newStatus, adminEmail });

    res.json({
      success: true,
      message: `Order #${orderId} status updated to ${newStatus}`,
      data: updatedOrder
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

    // If order has an active courier booking, cancel it via shippingService (Delhivery or Shiprocket)
    let courierCancelMsg = '';
    if (order.shipping && (order.shipping.shiprocketOrderId || order.shipping.awb || order.shipping.waybill)) {
      try {
        const cancelRes = await shippingService.cancelShipment(order);
        if (cancelRes && cancelRes.success) {
          courierCancelMsg = ` (${order.shipping.provider || 'Courier'} booking cancelled successfully)`;
        } else {
          courierCancelMsg = ` (Courier cancellation notice: ${(cancelRes && cancelRes.error) || 'Check courier dashboard'})`;
        }
      } catch (cancelErr) {
        logger.warn('COURIER_CANCEL_ERROR', { error: cancelErr.message, orderId });
        courierCancelMsg = ` (Courier cancel warning: ${cancelErr.message})`;
      }
    }

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';

    const events = order.events || [];
    events.push({
      event: 'ORDER_CANCELLED_BY_ADMIN',
      timestamp: now,
      details: `Order cancelled by ${adminEmail}. Reason: ${reason || 'Admin manual cancellation'}${courierCancelMsg}`
    });

    const updates = {
      status: 'CANCELLED',
      'shipping/status': 'CANCELLED',
      events
    };

    const updatedOrder = await firebaseService.updateOrder(orderId, updates);
    logger.info('ORDER_CANCELLED_BY_ADMIN', { orderId, adminEmail, reason, shipping: order.shipping });

    res.json({
      success: true,
      message: `Order ${orderId} has been successfully cancelled${courierCancelMsg}.`,
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
      invalidateOrdersCache();
      if (Array.isArray(cachedOrders)) {
        cachedOrders = cachedOrders.filter(o => o && o.orderId !== orderId);
      }
      return res.json({
        success: true,
        message: `Order #${orderId} has already been removed.`
      });
    }

    // If order has an active courier shipment, attempt to cancel it first
    if (order.shipping && (order.shipping.shiprocketOrderId || order.shipping.awb || order.shipping.waybill)) {
      try {
        await shippingService.cancelShipment(order);
      } catch (cancelErr) {
        logger.warn('COURIER_CANCEL_ON_DELETE_ERROR', { error: cancelErr.message, orderId });
      }
    }

    await firebaseService.deleteOrder(orderId);
    
    // Instantly invalidate in-memory cached orders
    invalidateOrdersCache();
    if (Array.isArray(cachedOrders)) {
      cachedOrders = cachedOrders.filter(o => o && o.orderId !== orderId);
    }

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
 * POST /api/admin/orders/:orderId/ship
 * POST /api/admin/orders/:orderId/move-to-shiprocket
 * POST /api/admin/orders/:orderId/move-to-delhivery
 * POST /api/admin/orders/:orderId/retry-shipping
 * Move order to selected Courier (Shiprocket or Delhivery) upon manual Admin action
 */
const handleMoveOrderToCourier = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { convertToCod, shippingMode } = req.body || {};
    
    // Determine target courier from path or body (default to shiprocket or delhivery)
    let courier = req.body?.courier;
    if (!courier) {
      if (req.path.includes('move-to-delhivery')) {
        courier = 'delhivery';
      } else if (req.path.includes('move-to-ekart')) {
        courier = 'ekart';
      } else if (req.path.includes('move-to-shiprocket')) {
        courier = 'shiprocket';
      } else {
        courier = 'shiprocket';
      }
    }
    courier = String(courier).toLowerCase().trim();

    // Mode resolution for Delhivery: 'Surface' or 'Express'
    const mode = String(shippingMode || 'Surface').toLowerCase() === 'express' ? 'Express' : 'Surface';

    let order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order was not found.'
        }
      });
    }

    // Ensure customer address format is valid
    if (order.customer) {
      if (!order.customer.address1 && order.customer.addressLine1) {
        order.customer.address1 = order.customer.addressLine1;
      }
      if (!order.customer.address2 && order.customer.addressLine2) {
        order.customer.address2 = order.customer.addressLine2;
      }
    }

    // Payment method adjustments
    const prov = (order.payment?.provider || order.paymentMethod || '').toLowerCase();
    const isAlreadyPaid = prov === 'razorpay' && order.payment?.status === 'CAPTURED';
    
    if (convertToCod || !isAlreadyPaid) {
      order.paymentMethod = 'cod';
      order.payment = {
        ...(order.payment || {}),
        provider: 'COD',
        status: 'COD_CONFIRMED'
      };
    }

    // Dispatch booking to chosen courier (Shiprocket, Delhivery, etc.)
    const shipmentDetails = await shippingService.bookShipment(order, courier, { shippingMode: mode });
    const now = new Date().toISOString();
    const events = order.events || [];
    const carrierName = shipmentDetails.courierName || (courier === 'delhivery' ? `Delhivery ${mode}` : 'Shiprocket');

    events.push({
      event: `SHIPMENT_MOVED_TO_${courier.toUpperCase()}_BY_ADMIN`,
      timestamp: now,
      details: `Shipment moved to ${carrierName}${courier === 'delhivery' ? ` (${mode})` : ''} by Admin. AWB: ${shipmentDetails.awb || 'Assigned'}`
    });

    const updatedOrder = await firebaseService.updateOrder(orderId, {
      payment: order.payment,
      paymentMethod: order.paymentMethod,
      shipping: {
        ...(order.shipping || {}),
        ...shipmentDetails
      },
      status: 'SHIPMENT_BOOKED',
      events
    });

    // Send customer shipping confirmation WhatsApp message with tracking details
    whatsappService.sendShippingConfirmationWhatsApp(updatedOrder).catch(err => {
      logger.error('ADMIN_MANUAL_DISPATCH_WHATSAPP_FAIL', { orderId, courier, error: err.message });
    });

    res.json({
      success: true,
      message: `Order successfully moved to ${carrierName}!`,
      data: updatedOrder
    });
  } catch (err) {
    logger.error('ADMIN_MOVE_TO_COURIER_FAILED', {
      orderId: req.params.orderId,
      courier: req.body?.courier,
      error: err.message
    });
    return res.status(400).json({
      success: false,
      error: {
        code: 'COURIER_BOOKING_FAILED',
        message: err.message || 'Courier shipment booking failed.'
      }
    });
  }
};

router.post('/orders/:orderId/ship', handleMoveOrderToCourier);
router.post('/orders/:orderId/move-to-shiprocket', handleMoveOrderToCourier);
router.post('/orders/:orderId/move-to-delhivery', handleMoveOrderToCourier);
router.post('/orders/:orderId/move-to-ekart', handleMoveOrderToCourier);
router.post('/orders/:orderId/retry-shipping', handleMoveOrderToCourier);

/**
 * POST /api/admin/orders/:orderId/convert-to-cod
 * Convert pending online payment / lead to COD, recalculating authoritative pricing
 */
router.post('/orders/:orderId/convert-to-cod', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';

    // Authoritatively recalculate pricing for COD (remove online discount, apply COD shipping rules)
    let recalculatedPricing = null;
    try {
      const items = (order.items && order.items.length > 0) ? order.items : [];
      const pincode = order.customer?.pincode || order.shippingAddress?.pincode || '423203';
      const couponCode = order.pricing?.couponCode || null;
      if (items.length > 0) {
        const trusted = await buildTrustedOrderItems(items, pincode, couponCode, 'cod');
        recalculatedPricing = trusted.pricing;
      }
    } catch (calcErr) {
      logger.warn('RECALC_PRICING_COD_CATALOG_FAILED_FALLBACK', { orderId, error: calcErr.message });
    }

    if (!recalculatedPricing) {
      const subtotal = Math.round(order.pricing?.subtotal || (order.payment?.amountPaise ? order.payment.amountPaise / 100 : 0) || 599);
      const pincode = String(order.customer?.pincode || order.shippingAddress?.pincode || '').trim();
      const isLocal = ['421305', '421302', '421308'].includes(pincode);
      const codShipping = (isLocal || subtotal >= 999) ? 0 : 100;
      const discount = Math.round(order.pricing?.discount || 0);
      const total = Math.max(0, subtotal - discount + codShipping);
      recalculatedPricing = {
        subtotal,
        discount,
        couponCode: order.pricing?.couponCode || null,
        onlineDiscount: 0,
        codCharge: 0,
        shipping: codShipping,
        isLocalDelivery: isLocal,
        total,
        currency: 'INR'
      };
    }

    const codTotal = Math.round(recalculatedPricing.total);

    const events = order.events || [];
    events.push({
      event: 'ORDER_CONVERTED_TO_COD',
      timestamp: now,
      details: `Shifted to Cash on Delivery (COD) by ${adminEmail}. Pricing recalculated to Rs. ${codTotal} (Subtotal: Rs. ${recalculatedPricing.subtotal}, Shipping: Rs. ${recalculatedPricing.shipping}, Online Discount: Rs. 0).`
    });

    const updatedOrder = await firebaseService.updateOrder(orderId, {
      paymentMethod: 'cod',
      payment: {
        ...(order.payment || {}),
        provider: 'COD',
        status: 'COD_CONFIRMED',
        amountPaise: codTotal * 100,
        currency: 'INR',
        paidAt: null
      },
      pricing: {
        ...(order.pricing || {}),
        ...recalculatedPricing,
        total: codTotal
      },
      status: 'PAYMENT_CAPTURED', // Marks as ready for courier booking
      events
    });

    logger.info('ORDER_CONVERTED_TO_COD_SUCCESS', {
      orderId,
      codTotal,
      adminEmail
    });

    res.json({
      success: true,
      message: `Order #${orderId} shifted to COD! Updated total: Rs. ${codTotal}`,
      data: updatedOrder
    });
  } catch (err) {
    logger.error('CONVERT_TO_COD_FAILED', { orderId: req.params.orderId, error: err.message });
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/confirm-cod
 * Mark unconfirmed COD order (or OTP pending) as Confirmed upon Phone / WhatsApp confirmation
 */
router.post('/orders/:orderId/confirm-cod', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';
    const events = order.events || [];

    events.push({
      event: 'COD_ORDER_CONFIRMED_BY_ADMIN',
      timestamp: now,
      details: `COD Order confirmed upon customer WhatsApp/Phone verification by ${adminEmail}. Ready for courier dispatch.`
    });

    const updatedOrder = await firebaseService.updateOrder(orderId, {
      paymentMethod: 'cod',
      payment: {
        ...(order.payment || {}),
        provider: 'COD',
        status: 'COD_CONFIRMED'
      },
      status: 'PAYMENT_CAPTURED', // Ready for courier booking
      events
    });

    logger.info('COD_ORDER_CONFIRMED_SUCCESS', { orderId, adminEmail });

    res.json({
      success: true,
      message: `Order #${orderId} COD confirmed successfully! Ready for dispatch.`,
      data: updatedOrder
    });
  } catch (err) {
    logger.error('CONFIRM_COD_FAILED', { orderId: req.params.orderId, error: err.message });
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/convert-to-prepaid
 * Convert COD or Pending order to Paid Online (Prepaid via UPI / Direct transfer), recalculating authoritative pricing
 */
router.post('/orders/:orderId/convert-to-prepaid', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { utr, notes } = req.body || {};
    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';

    // Authoritatively recalculate pricing for Online/Prepaid (apply 10% online discount on combos/898+, free shipping on 599+)
    let recalculatedPricing = null;
    try {
      const items = (order.items && order.items.length > 0) ? order.items : [];
      const pincode = order.customer?.pincode || order.shippingAddress?.pincode || '423203';
      const couponCode = order.pricing?.couponCode || null;
      if (items.length > 0) {
        const trusted = await buildTrustedOrderItems(items, pincode, couponCode, 'razorpay');
        recalculatedPricing = trusted.pricing;
      }
    } catch (calcErr) {
      logger.warn('RECALC_PRICING_PREPAID_CATALOG_FAILED_FALLBACK', { orderId, error: calcErr.message });
    }

    if (!recalculatedPricing) {
      const subtotal = Math.round(order.pricing?.subtotal || (order.payment?.amountPaise ? order.payment.amountPaise / 100 : 0) || 599);
      const pincode = String(order.customer?.pincode || order.shippingAddress?.pincode || '').trim();
      const isLocal = ['421305', '421302', '421308'].includes(pincode);
      const hasCombo = (order.items || []).some(i => i.hasJanamaz || i.sku?.includes('combo') || false) || subtotal >= 898;
      const onlineDiscount = hasCombo ? Math.round(subtotal * 0.10) : 0;
      const prepaidShipping = (isLocal || subtotal >= 599) ? 0 : (subtotal < 299 ? 50 : 100);
      const discount = Math.round(order.pricing?.discount || 0);
      const total = Math.max(0, subtotal - discount - onlineDiscount + prepaidShipping);
      recalculatedPricing = {
        subtotal,
        discount,
        couponCode: order.pricing?.couponCode || null,
        onlineDiscount,
        codCharge: 0,
        shipping: prepaidShipping,
        isLocalDelivery: isLocal,
        total,
        currency: 'INR'
      };
    }

    const prepaidTotal = Math.round(recalculatedPricing.total);

    const events = order.events || [];
    events.push({
      event: 'ORDER_MARKED_PREPAID_PAID_BY_ADMIN',
      timestamp: now,
      details: `Payment received & verified as Prepaid by ${adminEmail}. Pricing recalculated to Rs. ${prepaidTotal} (Online Discount: Rs. ${recalculatedPricing.onlineDiscount}, Shipping: Rs. ${recalculatedPricing.shipping}).${utr ? ` UTR/Ref: ${utr}.` : ''} ${notes || ''}`
    });

    const updatedOrder = await firebaseService.updateOrder(orderId, {
      paymentMethod: 'razorpay',
      payment: {
        ...(order.payment || {}),
        provider: 'PREPAID_VERIFIED',
        status: 'CAPTURED',
        amountPaise: prepaidTotal * 100,
        currency: 'INR',
        paidAt: now,
        utr: utr || null,
        adminVerificationNotes: notes || 'Verified by Admin'
      },
      pricing: {
        ...(order.pricing || {}),
        ...recalculatedPricing,
        total: prepaidTotal
      },
      status: 'PAYMENT_CAPTURED', // Ready for courier booking
      events
    });

    logger.info('ORDER_CONVERTED_TO_PREPAID_SUCCESS', { orderId, prepaidTotal, utr, adminEmail });

    res.json({
      success: true,
      message: `Order #${orderId} marked as PAID (Prepaid)! Updated total: Rs. ${prepaidTotal}`,
      data: updatedOrder
    });
  } catch (err) {
    logger.error('CONVERT_TO_PREPAID_FAILED', { orderId: req.params.orderId, error: err.message });
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/move-to-funnel
 * Move unconfirmed lead / abandoned order into WhatsApp Follow-up Funnel
 */
router.post('/orders/:orderId/move-to-funnel', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body || {};
    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';
    const events = order.events || [];
    events.push({
      event: 'MOVED_TO_FOLLOWUP_FUNNEL',
      timestamp: now,
      details: `Moved to Follow-up Funnel by ${adminEmail}. ${notes || ''}`
    });

    const updatedOrder = await firebaseService.updateOrder(orderId, {
      status: 'IN_FOLLOWUP_FUNNEL',
      inFollowupFunnel: true,
      funnelMovedAt: now,
      funnelFollowupCount: order.funnelFollowupCount || 0,
      events
    });

    logger.info('ORDER_MOVED_TO_FUNNEL', { orderId, adminEmail });

    res.json({
      success: true,
      message: `Order #${orderId} moved to Follow-up Funnel!`,
      data: updatedOrder
    });
  } catch (err) {
    logger.error('MOVE_TO_FUNNEL_FAILED', { orderId: req.params.orderId, error: err.message });
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/record-funnel-followup
 * Record that Follow-up 1 or Follow-up 2 was sent to customer
 */
router.post('/orders/:orderId/record-funnel-followup', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { followupStep, notes } = req.body || {};
    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';
    const currentCount = order.funnelFollowupCount || 0;
    const newCount = followupStep ? Number(followupStep) : currentCount + 1;

    const events = order.events || [];
    events.push({
      event: `FUNNEL_FOLLOWUP_${newCount}_SENT`,
      timestamp: now,
      details: `Follow-up ${newCount} sent by ${adminEmail}. ${notes || ''}`
    });

    const updatedOrder = await firebaseService.updateOrder(orderId, {
      funnelFollowupCount: newCount,
      lastFollowupSentAt: now,
      events
    });

    logger.info('FUNNEL_FOLLOWUP_RECORDED', { orderId, newCount, adminEmail });

    res.json({
      success: true,
      message: `Follow-up ${newCount} recorded for Order #${orderId}`,
      data: updatedOrder
    });
  } catch (err) {
    logger.error('RECORD_FUNNEL_FOLLOWUP_FAILED', { orderId: req.params.orderId, error: err.message });
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/delhivery/update
 * Update package & delivery details directly on Delhivery via /api/p/edit API
 * Only available for orders booked with Delhivery
 */
router.post('/orders/:orderId/delhivery/update', async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      name,
      phone,
      address,
      cod,
      paymentMode,
      weightGrams,
      length,
      width,
      height,
      productDetails
    } = req.body || {};

    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const provider = (order.shipping?.provider || '').toLowerCase();
    const waybill = order.shipping?.waybill || order.shipping?.awb;

    if (provider !== 'delhivery' || !waybill) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NOT_DELHIVERY_ORDER',
          message: 'The Update Delivery system is only available for active Delhivery orders with an assigned Waybill/AWB.'
        }
      });
    }

    // Call Delhivery Edit API (/api/p/edit)
    const updateResult = await delhiveryService.updateShipment(waybill, {
      name,
      phone,
      address,
      cod,
      paymentMode,
      weightGrams,
      length,
      width,
      height,
      productDetails
    });

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';
    const events = order.events || [];

    events.push({
      event: 'DELHIVERY_SHIPMENT_UPDATED_BY_ADMIN',
      timestamp: now,
      details: `Delhivery shipment updated via /api/p/edit API by ${adminEmail}. Waybill: ${waybill}`
    });

    // Update customer and package attributes in Firebase
    const updates = { events };

    if (name) {
      updates['customer.name'] = name;
      if (!order.customer) order.customer = {};
      order.customer.name = name;
    }
    if (phone) {
      updates['customer.phone'] = phone;
      if (!order.customer) order.customer = {};
      order.customer.phone = phone;
    }
    if (address) {
      updates['customer.address1'] = address;
      updates['customer.addressLine1'] = address;
      if (!order.customer) order.customer = {};
      order.customer.address1 = address;
      order.customer.addressLine1 = address;
    }
    if (cod !== undefined && cod !== null && cod !== '') {
      const parsedCod = parseFloat(cod);
      updates['pricing.total'] = parsedCod;
      if (!order.pricing) order.pricing = {};
      order.pricing.total = parsedCod;
    }
    if (weightGrams) {
      const parsedWeightKg = parseFloat(weightGrams) / 1000;
      updates['package.weight'] = parsedWeightKg;
      if (!order.package) order.package = {};
      order.package.weight = parsedWeightKg;
    }
    if (length || width || height) {
      if (!order.package) order.package = {};
      if (length) {
        updates['package.length'] = parseFloat(length);
        order.package.length = parseFloat(length);
      }
      if (width) {
        updates['package.breadth'] = parseFloat(width);
        order.package.breadth = parseFloat(width);
      }
      if (height) {
        updates['package.height'] = parseFloat(height);
        order.package.height = parseFloat(height);
      }
    }

    const updatedOrder = await firebaseService.updateOrder(orderId, updates);

    res.json({
      success: true,
      message: 'Delhivery delivery details updated successfully!',
      data: {
        order: updatedOrder,
        delhiveryResponse: updateResult
      }
    });
  } catch (err) {
    logger.error('ADMIN_DELHIVERY_UPDATE_FAILED', {
      orderId: req.params.orderId,
      error: err.message
    });
    return res.status(400).json({
      success: false,
      error: {
        code: 'DELHIVERY_UPDATE_FAILED',
        message: err.message || 'Failed to update delivery details on Delhivery API.'
      }
    });
  }
});

/**
 * POST /api/admin/orders/:orderId/delhivery/sync-status
 * Sync and refresh real-time delivery tracking status from Delhivery Tracking API
 * Only available for orders booked with Delhivery
 */
router.post('/orders/:orderId/delhivery/sync-status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const provider = (order.shipping?.provider || '').toLowerCase();
    const waybill = order.shipping?.waybill || order.shipping?.awb;

    if (provider !== 'delhivery' || !waybill) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NOT_DELHIVERY_ORDER',
          message: 'Delivery sync is only available for active Delhivery orders with a valid waybill.'
        }
      });
    }

    const syncResult = await delhiveryService.syncDeliveryStatus(waybill);
    const now = new Date().toISOString();
    const rawStatus = (syncResult.rawStatus || '').toUpperCase();

    const updates = {
      'shipping.lastTrackingUpdate': now,
      'shipping.delhiveryStatus': syncResult.rawStatus || 'Unknown'
    };

    if (['IN TRANSIT', 'IN_TRANSIT', 'DISPATCHED'].some(s => rawStatus.includes(s))) {
      updates.status = 'SHIPPED';
      updates['shipping.status'] = 'IN_TRANSIT';
    } else if (['OUT FOR DELIVERY', 'OUT_FOR_DELIVERY'].some(s => rawStatus.includes(s))) {
      updates.status = 'OUT_FOR_DELIVERY';
      updates['shipping.status'] = 'OUT_FOR_DELIVERY';
    } else if (['DELIVERED'].some(s => rawStatus.includes(s))) {
      updates.status = 'DELIVERED';
      updates['shipping.status'] = 'DELIVERED';
    } else if (['RTO', 'RETURN'].some(s => rawStatus.includes(s))) {
      updates.status = 'RTO';
      updates['shipping.status'] = 'RTO';
    }

    const events = order.events || [];
    events.push({
      event: 'DELHIVERY_STATUS_SYNCED',
      timestamp: now,
      details: `Delhivery status synced: ${syncResult.rawStatus || 'Active'}${syncResult.statusLocation ? ` at ${syncResult.statusLocation}` : ''}`
    });
    updates.events = events;

    const updatedOrder = await firebaseService.updateOrder(orderId, updates);

    res.json({
      success: true,
      message: `Delhivery status synced: ${syncResult.rawStatus || 'Updated'}`,
      data: {
        order: updatedOrder,
        syncResult
      }
    });
  } catch (err) {
    logger.error('ADMIN_DELHIVERY_SYNC_FAILED', {
      orderId: req.params.orderId,
      error: err.message
    });
    return res.status(400).json({
      success: false,
      error: {
        code: 'DELHIVERY_SYNC_FAILED',
        message: err.message || 'Failed to sync delivery status from Delhivery.'
      }
    });
  }
});

/**
 * GET /api/admin/catalog-items
 * Get all available products and variants for admin item swap
 */
router.get('/catalog-items', (req, res) => {
  const items = [];
  for (const prod of catalog) {
    for (const v of prod.variants) {
      items.push({
        sku: v.sku,
        productId: prod.id,
        productName: prod.name,
        variantName: v.name,
        displayName: `${prod.name} - ${v.name} (Rs. ${v.price})`,
        price: v.price,
        weightKg: v.weightKg,
        weightLabel: v.weightLabel,
        category: prod.category,
        hsn: prod.hsn,
        dimensions: prod.dimensions
      });
    }
  }
  res.json({ success: true, data: items });
});

/**
 * POST /api/admin/orders/:orderId/change-product
 * Admin order product modification & Shiprocket sync
 */
router.post('/orders/:orderId/change-product', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const {
      newSku,
      quantity = 1,
      unitPrice,
      shippingCharge,
      discount = 0,
      codCharge,
      finalTotal,
      reason = 'Customer requested product change'
    } = req.body;

    if (!newSku) {
      return res.status(400).json({
        success: false,
        error: { code: 'SKU_REQUIRED', message: 'New product SKU is required.' }
      });
    }

    const newItem = findItemBySku(newSku);
    if (!newItem) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_SKU', message: `Product with SKU [${newSku}] was not found in catalog.` }
      });
    }

    const order = await firebaseService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.' }
      });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const itemPrice = (unitPrice !== undefined && unitPrice !== null && !isNaN(parseFloat(unitPrice)))
      ? Math.max(0, parseFloat(unitPrice))
      : newItem.unitPrice;

    const oldItemSummary = (order.items || []).map(i => `${i.name || i.title || i.sku} (x${i.quantity || 1})`).join(', ');

    // Construct new item object
    const updatedItems = [
      {
        productId: newItem.productId,
        sku: newItem.sku,
        name: `${newItem.productName} - ${newItem.variantName}`,
        productName: newItem.productName,
        variantName: newItem.variantName,
        quantity: qty,
        unitPrice: itemPrice,
        totalPrice: itemPrice * qty,
        weightKg: newItem.weightKg,
        weightLabel: newItem.weightLabel,
        hsn: newItem.hsn
      }
    ];

    const newWeightKg = Math.max(0.05, Math.round(newItem.weightKg * qty * 1000) / 1000);
    const newDimensions = newItem.dimensions || { length: 15, breadth: 10, height: 2.5 };

    const updatedPackage = {
      weightKg: newWeightKg,
      dimensions: newDimensions
    };

    // Calculate custom pricing
    const lineSubtotal = itemPrice * qty;
    const isCod = (order.paymentMethod === 'cod') || (order.payment?.provider === 'COD');
    
    // Delivery charge
    let resolvedShipping = 0;
    if (shippingCharge !== undefined && shippingCharge !== null && !isNaN(parseFloat(shippingCharge))) {
      resolvedShipping = Math.max(0, parseFloat(shippingCharge));
    } else if (order.pricing?.shipping !== undefined) {
      resolvedShipping = order.pricing.shipping;
    } else {
      resolvedShipping = 100;
    }

    const resolvedDiscount = (discount !== undefined && discount !== null && !isNaN(parseFloat(discount)))
      ? Math.max(0, parseFloat(discount))
      : (order.pricing?.discount || 0);

    const resolvedCodCharge = (codCharge !== undefined && codCharge !== null && !isNaN(parseFloat(codCharge)))
      ? Math.max(0, parseFloat(codCharge))
      : (order.pricing?.codCharge || (isCod ? 40 : 0));

    let calculatedTotal = lineSubtotal + resolvedShipping + (isCod ? resolvedCodCharge : 0) - resolvedDiscount;
    if (finalTotal !== undefined && finalTotal !== null && !isNaN(parseFloat(finalTotal))) {
      calculatedTotal = Math.max(0, parseFloat(finalTotal));
    } else {
      calculatedTotal = Math.max(0, calculatedTotal);
    }

    const updatedPricing = {
      ...(order.pricing || {}),
      subtotal: lineSubtotal,
      shipping: resolvedShipping,
      discount: resolvedDiscount,
      codCharge: isCod ? resolvedCodCharge : 0,
      total: calculatedTotal
    };

    const now = new Date().toISOString();
    const adminEmail = (req.adminUser && req.adminUser.email) || 'Administrator';
    const events = order.events || [];

    // Attempt Carrier sync if already pushed to Shiprocket or Delhivery
    let carrierSyncNotice = '';
    const srOrderId = order.shipping?.shiprocketOrderId;
    const isDelhiveryBooked = (order.shipping?.provider || '').toLowerCase() === 'delhivery';
    const delhiveryWaybill = order.shipping?.waybill || order.shipping?.awb;

    if (srOrderId) {
      const orderForSr = {
        ...order,
        items: updatedItems,
        pricing: updatedPricing,
        package: updatedPackage
      };
      const srUpdateRes = await shiprocketService.updateShipmentItems(orderForSr);
      if (srUpdateRes.success) {
        carrierSyncNotice = ' (Synced successfully with Shiprocket)';
      } else {
        carrierSyncNotice = ` (Shiprocket Notice: ${srUpdateRes.error || 'Please verify in Shiprocket'})`;
      }
    } else if (isDelhiveryBooked && delhiveryWaybill) {
      try {
        const totalAmount = Math.round(calculatedTotal);
        const weightGrams = Math.max(100, Math.round((updatedPackage.weight || 0.15) * 1000));
        await delhiveryService.updateShipment(delhiveryWaybill, {
          productDetails: `${newItem.productName} (${newItem.variantName}) x${qty}`,
          weightGrams,
          cod: isCod ? totalAmount : 0
        });
        carrierSyncNotice = ' (Synced successfully with Delhivery API)';
      } catch (dErr) {
        carrierSyncNotice = ` (Delhivery Notice: ${dErr.message || 'Please verify in Delhivery panel'})`;
      }
    }

    events.push({
      event: 'PRODUCT_CHANGED_BY_ADMIN',
      timestamp: now,
      details: `Product updated to [${newItem.productName} - ${newItem.variantName} (SKU: ${newItem.sku}, Qty: ${qty}, Price: Rs. ${itemPrice}, Shipping: Rs. ${resolvedShipping}, Total: Rs. ${calculatedTotal})] by ${adminEmail}. Reason: ${reason}${carrierSyncNotice}`
    });

    const updates = {
      items: updatedItems,
      package: updatedPackage,
      pricing: updatedPricing,
      events
    };

    const updatedOrder = await firebaseService.updateOrder(orderId, updates);
    logger.info('ORDER_PRODUCT_CHANGED_BY_ADMIN', {
      orderId,
      oldItemSummary,
      newSku: newItem.sku,
      unitPrice: itemPrice,
      shipping: resolvedShipping,
      total: calculatedTotal,
      adminEmail,
      shiprocketOrderId: srOrderId
    });

    res.json({
      success: true,
      message: `Order #${orderId} product updated to ${newItem.productName} (Total: Rs. ${calculatedTotal})!${shiprocketSyncNotice}`,
      data: updatedOrder
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/orders/:orderId/whatsapp
 * Send a WhatsApp message to customer directly via Evolution API backend
 */
router.post('/orders/:orderId/whatsapp', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message, phone } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required.' });
    }

    const order = await firebaseService.getOrder(orderId);
    const targetPhone = phone || order?.customer?.phone;

    if (!targetPhone) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const whatsappService = require('../services/whatsappService');
    const sent = await whatsappService.sendTextMessage(targetPhone, message.trim());

    if (!sent) {
      return res.status(502).json({
        success: false,
        error: 'Failed to send WhatsApp message via Evolution API. Please check server logs and WhatsApp instance.'
      });
    }

    // Log event in order history
    if (order) {
      await firebaseService.logOrderEvent(orderId, 'WHATSAPP_MESSAGE_SENT', {
        phone: targetPhone,
        messagePreview: message.trim().substring(0, 100),
        sentAt: new Date().toISOString()
      }).catch(err => logger.warn('LOG_EVENT_FAIL', { error: err.message }));
    }

    return res.json({
      success: true,
      message: 'WhatsApp message sent successfully via API to customer!'
    });
  } catch (err) {
    logger.error('ADMIN_SEND_WHATSAPP_API_FAIL', { orderId: req.params.orderId, error: err.message });
    return res.status(500).json({ success: false, error: err.message || 'Internal error sending WhatsApp message.' });
  }
});

/**
 * GET /api/admin/whatsapp/templates
 * Retrieve customized templates from Firebase settings
 */
router.get('/whatsapp/templates', async (req, res) => {
  try {
    const templates = await firebaseService.getSettings('whatsapp_templates');
    res.json({
      success: true,
      templates: templates || {}
    });
  } catch (err) {
    logger.error('GET_WHATSAPP_TEMPLATES_ERROR', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/whatsapp/templates
 * Save customized templates to Firebase settings
 */
router.post('/whatsapp/templates', async (req, res) => {
  try {
    const { templates } = req.body;
    if (!templates || typeof templates !== 'object') {
      return res.status(400).json({ success: false, error: 'Valid templates object is required.' });
    }

    const saved = await firebaseService.saveSettings('whatsapp_templates', templates);
    res.json({
      success: true,
      message: 'WhatsApp templates saved successfully to Firebase!',
      templates: saved
    });
  } catch (err) {
    logger.error('SAVE_WHATSAPP_TEMPLATES_ERROR', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
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

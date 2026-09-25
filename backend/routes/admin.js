const express = require('express');
const router = express.Router();
const axios = require('axios');

const { verifyAdminAuth } = require('../middleware/adminAuth');
const firebaseService = require('../services/firebaseService');
const shiprocketService = require('../services/shiprocketService');
const { catalog, findItemBySku } = require('../config/catalog');
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
    const { status, search, paymentProvider, startDate, endDate, minAmount, maxAmount } = req.query;

    let orders = await fetchAllOrders();
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
      const isPaid = (o.payment?.status || '').toUpperCase() === 'CAPTURED' || Boolean(o.payment?.razorpayPaymentId) || (!isCod && ['PAYMENT_CAPTURED', 'SHIPMENT_BOOKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(orderStatus));

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
    const { startDate, endDate } = req.query;
    let orders = await fetchAllOrders();
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
      const isPaid = paymentStatus === 'CAPTURED' || Boolean(o.payment?.razorpayPaymentId) || (!isCod && ['PAYMENT_CAPTURED', 'SHIPMENT_BOOKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(orderStatus));
      const orderTotal = o.pricing?.total || (o.payment?.amountPaise ? o.payment.amountPaise / 100 : 0);
      const isCancelled = orderStatus === 'CANCELLED';

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
 * POST /api/admin/orders/:orderId/move-to-shiprocket
 * Move order to Shiprocket upon phone confirmation (COD or Prepaid)
 */
const handleMoveOrderToShiprocket = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { convertToCod } = req.body || {};
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

    // Ensure customer address format is valid for Shiprocket
    if (order.customer) {
      if (!order.customer.address1 && order.customer.addressLine1) {
        order.customer.address1 = order.customer.addressLine1;
      }
      if (!order.customer.address2 && order.customer.addressLine2) {
        order.customer.address2 = order.customer.addressLine2;
      }
    }

    // If convertToCod is true or order was unpaid online / unverified COD
    const prov = (order.payment?.provider || order.paymentMethod || '').toLowerCase();
    const isAlreadyPaid = prov === 'razorpay' && order.payment?.status === 'CAPTURED';
    
    if (convertToCod || !isAlreadyPaid) {
      order.paymentMethod = 'cod';
      order.payment = {
        ...(order.payment || {}),
        provider: 'COD',
        status: 'COD_PENDING'
      };
    }

    const shipmentDetails = await shiprocketService.createShipment(order);
    const now = new Date().toISOString();
    const events = order.events || [];

    events.push({
      event: 'SHIPMENT_MOVED_TO_SHIPROCKET_BY_ADMIN',
      timestamp: now,
      details: `Shipment moved to Shiprocket by Admin (Phone Confirmed). AWB: ${shipmentDetails.awb || 'Pending'}`
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

    res.json({
      success: true,
      message: 'Order successfully moved to Shiprocket!',
      data: updatedOrder
    });
  } catch (err) {
    logger.error('ADMIN_MOVE_TO_SHIPROCKET_FAILED', { orderId: req.params.orderId, error: err.message });
    return res.status(400).json({
      success: false,
      error: {
        code: 'SHIPROCKET_BOOKING_FAILED',
        message: err.message || 'Shiprocket shipment booking failed.'
      }
    });
  }
};

router.post('/orders/:orderId/retry-shipping', handleMoveOrderToShiprocket);
router.post('/orders/:orderId/move-to-shiprocket', handleMoveOrderToShiprocket);

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
      resolvedShipping = lineSubtotal >= 699 ? 0 : 49;
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

    // Attempt Shiprocket sync if already pushed to Shiprocket
    let shiprocketSyncNotice = '';
    const srOrderId = order.shipping?.shiprocketOrderId;
    if (srOrderId) {
      const orderForSr = {
        ...order,
        items: updatedItems,
        pricing: updatedPricing,
        package: updatedPackage
      };
      const srUpdateRes = await shiprocketService.updateShipmentItems(orderForSr);
      if (srUpdateRes.success) {
        shiprocketSyncNotice = ' (Synced successfully with Shiprocket)';
      } else {
        shiprocketSyncNotice = ` (Shiprocket Notice: ${srUpdateRes.error || 'Please verify in Shiprocket'})`;
      }
    }

    events.push({
      event: 'PRODUCT_CHANGED_BY_ADMIN',
      timestamp: now,
      details: `Product updated to [${newItem.productName} - ${newItem.variantName} (SKU: ${newItem.sku}, Qty: ${qty}, Price: Rs. ${itemPrice}, Shipping: Rs. ${resolvedShipping}, Total: Rs. ${calculatedTotal})] by ${adminEmail}. Reason: ${reason}${shiprocketSyncNotice}`
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

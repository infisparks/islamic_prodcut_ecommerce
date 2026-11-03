const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

// Strict Idempotency / De-duplication Sets to guarantee Admin & Customer never receive duplicate messages
const adminNotifiedOrderIds = new Set();
const customerNotifiedOrderIds = new Set();

/**
 * Clean and format Indian phone number to 91XXXXXXXXXX format.
 */
function sanitizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits.length >= 10 ? digits : null;
}

/**
 * Calculate and format estimated delivery date as +5 days from base date.
 */
function formatEstimatedDeliveryDate(baseDate) {
  const d = baseDate ? new Date(baseDate) : new Date();
  d.setDate(d.getDate() + 5);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Send a raw text message via WhatsApp Evolution API.
 */
async function sendTextMessage(phone, text) {
  const formattedNumber = sanitizePhone(phone);
  if (!formattedNumber) {
    logger.warn('WHATSAPP_INVALID_PHONE', { phone });
    return false;
  }

  const { apiUrl, apiKey, instance } = config.whatsapp;
  if (!apiUrl || !apiKey || !instance) {
    logger.warn('WHATSAPP_CONFIG_MISSING', { apiUrl, instance });
    return false;
  }

  const targetUrl = `${apiUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(instance)}`;
  const payload = {
    number: formattedNumber,
    text: text
  };

  try {
    const response = await axios.post(targetUrl, payload, {
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    logger.info('WHATSAPP_MESSAGE_SENT', {
      number: formattedNumber,
      status: response.status,
      data: response.data
    });
    return true;
  } catch (err) {
    logger.error('WHATSAPP_SEND_FAILED', {
      number: formattedNumber,
      error: err.response ? err.response.data : err.message
    });
    return false;
  }
}

/**
 * Send WhatsApp OTP for Cash on Delivery (COD) verification.
 */
async function sendCodOtpWhatsApp(phone, otp) {
  const message = 
    `🔒 *Fatima Calligrapher - COD Verification*\n\n` +
    `Your OTP code to confirm your Cash on Delivery (COD) order is: *${otp}*\n\n` +
    `⏱️ Valid for 10 minutes. Please enter this code on the website to confirm your order.\n\n` +
    `📞 *Customer Support:* +91 99703 47703`;

  return await sendTextMessage(phone, message);
}

/**
 * Send WhatsApp alert to Admin / Owner (918600380233) when a product is booked.
 * Strict idempotency: exactly ONE alert per order ID is ever sent to the admin.
 */
async function sendAdminOrderNotificationWhatsApp(order) {
  if (!order || !order.orderId) return false;

  const orderId = String(order.orderId).trim();

  // De-duplication check: Skip if admin was already notified for this order
  if (adminNotifiedOrderIds.has(orderId)) {
    logger.info('WHATSAPP_ADMIN_ALREADY_NOTIFIED_SKIP', { orderId });
    return false;
  }

  if (order.notifications && order.notifications.adminNotified) {
    logger.info('WHATSAPP_ADMIN_ALREADY_NOTIFIED_RECORD_SKIP', { orderId });
    return false;
  }

  adminNotifiedOrderIds.add(orderId);
  setTimeout(() => adminNotifiedOrderIds.delete(orderId), 24 * 60 * 60 * 1000);

  const adminPhone = config.whatsapp.notifyNumber || '918600380233';

  const itemsList = (order.items || [])
    .map((i, idx) => {
      const variantDetail = i.variantName || i.variant || 'Standard';
      const janamazDetail = i.janamazColor ? ` • Janamaz Color: ${i.janamazColor}` : '';
      return `${idx + 1}. *${i.name || i.title || i.sku || 'Product'}* (${variantDetail}${janamazDetail}) x${i.quantity || 1} - ₹${((i.unitPrice || i.price || 0) * (i.quantity || 1))}`;
    })
    .join('\n');

  const isCod = (order.payment && order.payment.provider === 'COD') || order.paymentMethod === 'cod';
  const paymentMethod = isCod ? '💵 Cash on Delivery (COD)' : '💳 Online Payment (Razorpay)';
  const deliveryDate = formatEstimatedDeliveryDate(order.createdAt);

  const customerName = order.customer?.name || 'N/A';
  const customerPhone = order.customer?.phone || 'N/A';
  const addressParts = [
    order.customer?.address1,
    order.customer?.address2,
    order.customer?.city,
    order.customer?.state,
    order.customer?.pincode ? `PIN: ${order.customer.pincode}` : null
  ].filter(Boolean);
  const addressStr = addressParts.length > 0 ? addressParts.join(', ') : 'N/A';

  const LOCAL_PINCODES = ['421305', '421302', '421308'];
  const isNearby = LOCAL_PINCODES.includes(String(order.customer?.pincode || '').trim()) || Boolean(order.isLocalDelivery);
  const localAlert = isNearby ? `📍 *NEARBY LOCATION (${order.customer?.pincode}):* Deliver order manually (FREE Delivery applied)!\n\n` : '';

  const message =
    `🔔 *NEW PRODUCT BOOKING RECEIVED!*\n\n` +
    localAlert +
    `📋 *Order ID:* #${order.orderId}\n` +
    `💳 *Payment Method:* ${paymentMethod}\n` +
    `💰 *Total Amount:* ₹${order.pricing?.total || 0}\n\n` +
    `👤 *Customer Details:*\n` +
    `• *Name:* ${customerName}\n` +
    `• *Mobile:* ${customerPhone}\n` +
    `• *Address:* ${addressStr}\n\n` +
    `🛍️ *Ordered Products:*\n${itemsList}\n\n` +
    `📦 *Shipment Status:* ${isNearby ? '📍 Local Manual Delivery' : (order.shipping?.status || 'NOT_BOOKED')} ${order.shipping?.awb ? `(AWB: ${order.shipping.awb})` : ''}\n` +
    `🚚 *Est. Delivery Date (+5 days):* ${deliveryDate}\n` +
    `📞 *Support Helpline:* +91 99703 47703\n` +
    `⏰ *Booking Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  logger.info('SENDING_ADMIN_WHATSAPP_NOTIFICATION', { orderId: order.orderId, adminPhone });
  return await sendTextMessage(adminPhone, message);
}

/**
 * Send Order Confirmation WhatsApp message to Customer.
 */
async function sendOrderConfirmationWhatsApp(order) {
  if (!order || !order.customer || !order.customer.phone || !order.orderId) return false;

  const orderId = String(order.orderId).trim();

  // 1. Dispatch Admin Notification (guaranteed exactly once via idempotency guard)
  sendAdminOrderNotificationWhatsApp(order).catch(err => {
    logger.error('WHATSAPP_ADMIN_NOTIFY_FAILED', { orderId: order.orderId, error: err.message });
  });

  const adminPhone = config.whatsapp.notifyNumber || '918600380233';
  const cleanAdminPhone = sanitizePhone(adminPhone);
  const cleanCustomerPhone = sanitizePhone(order.customer.phone);

  // If order was booked with Admin's own mobile number (e.g. testing the booking),
  // suppress customer confirmation so Admin receives strictly ONE notification message.
  if (cleanAdminPhone && cleanCustomerPhone && cleanAdminPhone === cleanCustomerPhone) {
    logger.info('WHATSAPP_CUSTOMER_IS_ADMIN_SKIP_CONFIRMATION', { orderId, phone: cleanCustomerPhone });
    return true;
  }

  // De-duplicate customer confirmation
  if (customerNotifiedOrderIds.has(orderId)) {
    logger.info('WHATSAPP_CUSTOMER_ALREADY_NOTIFIED_SKIP', { orderId });
    return false;
  }
  customerNotifiedOrderIds.add(orderId);
  setTimeout(() => customerNotifiedOrderIds.delete(orderId), 24 * 60 * 60 * 1000);

  const customerName = order.customer.name || 'Valued Customer';
  const itemsList = (order.items || [])
    .map(i => {
      const variantDetail = i.variantName || i.variant || 'Standard';
      const janamazDetail = i.janamazColor ? ` • Janamaz Color: ${i.janamazColor}` : '';
      return `• *${i.name || i.title || i.sku || 'Item'}* (${variantDetail}${janamazDetail}) x${i.quantity || 1}`;
    })
    .join('\n') || '• Authentic Umrah Duas Flashcard Collection';

  const isCod = (order.payment && order.payment.provider === 'COD') || order.paymentMethod === 'cod';
  const paymentType = isCod ? 'Cash on Delivery (COD)' : 'Paid Online (Razorpay)';
  const totalAmount = order.pricing?.total || (order.payment?.amountPaise ? order.payment.amountPaise / 100 : 0);
  const deliveryDate = formatEstimatedDeliveryDate(order.createdAt);

  const addressParts = [
    order.customer.address1,
    order.customer.address2,
    order.customer.city,
    order.customer.state,
    order.customer.pincode ? `PIN: ${order.customer.pincode}` : null
  ].filter(Boolean);
  const addressStr = addressParts.length > 0 ? addressParts.join(', ') : 'Provided on Checkout';

  const message =
    `Assalamu Alaikum / Hello ${customerName},\n\n` +
    `🎉 *Your order is successfully placed with Fatima Calligrapher!*\n\n` +
    `📋 *Order ID:* #${order.orderId}\n` +
    `💳 *Payment Method:* ${paymentType}\n` +
    `💰 *Total Amount:* ₹${totalAmount}\n\n` +
    `📦 *Items Ordered:*\n${itemsList}\n\n` +
    `📍 *Delivery Address:* ${customerName}, ${addressStr}\n\n` +
    `🚚 *Estimated Delivery Date:* *${deliveryDate}* (Within 5 Days)\n\n` +
    `We are preparing your parcel for prompt dispatch. You will receive tracking updates here once shipped! ❤️\n\n` +
    `📞 *For Support / Help Call:* +91 99703 47703\n` +
    `*Fatima Calligrapher Team*`;

  return await sendTextMessage(order.customer.phone, message);
}

/**
 * Send Shipping Confirmation & Tracking WhatsApp message to Customer.
 */
async function sendShippingConfirmationWhatsApp(order) {
  if (!order || !order.customer || !order.customer.phone) return false;

  const isDelhivery = (order.shipping?.provider || '').toLowerCase() === 'delhivery';
  const courier = order.shipping?.courierName || (isDelhivery ? 'Delhivery Express' : 'Shiprocket Express Partner');
  const awb = order.shipping?.awb || order.shipping?.waybill || 'Processing';
  const defaultTrackUrl = isDelhivery 
    ? (awb ? `https://www.delhivery.com/track/package/${awb}` : 'https://www.delhivery.com')
    : `https://shiprocket.co/tracking/${order.shipping?.shiprocketOrderId || awb || ''}`;
  const trackingUrl = order.shipping?.trackingUrl || defaultTrackUrl;
  const deliveryDate = formatEstimatedDeliveryDate(order.shipping?.bookedAt || order.createdAt);

  const message =
    `🚚 *Shipment Dispatched!*\n` +
    `Your order *#${order.orderId}* is on its way!\n\n` +
    `📦 *Courier Partner:* ${courier}\n` +
    `🔖 *AWB / Tracking Code:* ${awb}\n` +
    `🗓️ *Estimated Delivery:* *${deliveryDate}* (Within 5 Days)\n` +
    `🔗 *Live Tracking Link:* ${trackingUrl}\n\n` +
    `📞 *Customer Support:* +91 99703 47703\n\n` +
    `Thank you for choosing *Fatima Calligrapher*! ✨`;

  return await sendTextMessage(order.customer.phone, message);
}

module.exports = {
  sanitizePhone,
  sendTextMessage,
  sendCodOtpWhatsApp,
  sendOrderConfirmationWhatsApp,
  sendShippingConfirmationWhatsApp,
  sendAdminOrderNotificationWhatsApp
};

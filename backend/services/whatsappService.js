const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

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
    `⏱️ Valid for 10 minutes. Please enter this code on the website to confirm your order. Do not share this OTP with anyone.`;

  return await sendTextMessage(phone, message);
}

/**
 * Send WhatsApp alert to Admin / Owner (918600380233) when a product is booked.
 */
async function sendAdminOrderNotificationWhatsApp(order) {
  if (!order) return false;

  const adminPhone = config.whatsapp.notifyNumber || '918600380233';

  const itemsList = (order.items || [])
    .map((i, idx) => `${idx + 1}. *${i.title || i.sku || 'Product'}* (${i.variant || 'Standard'}) x${i.quantity} - ₹${(i.price || 0) * i.quantity}`)
    .join('\n');

  const isCod = order.payment && order.payment.provider === 'COD';
  const paymentMethod = isCod ? '💵 Cash on Delivery (COD)' : '💳 Online Payment (Razorpay)';

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

  const message =
    `🔔 *NEW PRODUCT BOOKING RECEIVED!*\n\n` +
    `📋 *Order ID:* #${order.orderId}\n` +
    `💳 *Payment Method:* ${paymentMethod}\n` +
    `💰 *Total Amount:* ₹${order.pricing?.total || 0}\n\n` +
    `👤 *Customer Details:*\n` +
    `• *Name:* ${customerName}\n` +
    `• *Mobile:* ${customerPhone}\n` +
    `• *Address:* ${addressStr}\n\n` +
    `🛍️ *Ordered Products:*\n${itemsList}\n\n` +
    `📦 *Shipment Status:* ${order.shipping?.status || 'NOT_BOOKED'} ${order.shipping?.awb ? `(AWB: ${order.shipping.awb})` : ''}\n` +
    `⏰ *Booking Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  logger.info('SENDING_ADMIN_WHATSAPP_NOTIFICATION', { orderId: order.orderId, adminPhone });
  return await sendTextMessage(adminPhone, message);
}

/**
 * Send Order Confirmation WhatsApp message.
 */
async function sendOrderConfirmationWhatsApp(order) {
  if (!order || !order.customer || !order.customer.phone) return false;

  // Always send Admin notification alert to 918600380233
  sendAdminOrderNotificationWhatsApp(order).catch(err => {
    logger.error('WHATSAPP_ADMIN_NOTIFY_FAILED', { orderId: order.orderId, error: err.message });
  });

  const itemsList = (order.items || [])
    .map(i => `• *${i.title}* (${i.variant || 'Standard'}) x${i.quantity}`)
    .join('\n');

  const paymentType = order.payment && order.payment.provider === 'COD' 
    ? 'Cash on Delivery (COD)' 
    : 'Online Payment (Razorpay)';

  const message =
    `✨ *Order Confirmed!*\n` +
    `Thank you for shopping with *Fatima Calligrapher*.\n\n` +
    `📋 *Order ID:* #${order.orderId}\n` +
    `💰 *Total Paid/Amount:* ₹${order.pricing?.total || 0}\n` +
    `💳 *Payment Method:* ${paymentType}\n\n` +
    `📦 *Items Ordered:*\n${itemsList}\n\n` +
    `📍 *Delivery Address:* ${order.customer.name}, ${order.customer.address1}, ${order.customer.city} - ${order.customer.pincode}\n\n` +
    `We are preparing your parcel for dispatch. You will receive tracking updates here once shipped! ❤️`;

  return await sendTextMessage(order.customer.phone, message);
}

/**
 * Send Shipping Confirmation & Tracking WhatsApp message.
 */
async function sendShippingConfirmationWhatsApp(order) {
  if (!order || !order.customer || !order.customer.phone) return false;

  const courier = order.shipping?.courierName || 'Shiprocket Express Partner';
  const trackingUrl = order.shipping?.trackingUrl || `https://shiprocket.co/tracking/${order.shipping?.shiprocketOrderId || ''}`;
  const awb = order.shipping?.awb || 'Processing';

  const message =
    `🚚 *Shipment Dispatched!*\n` +
    `Your order *#${order.orderId}* is on its way!\n\n` +
    `📦 *Courier Partner:* ${courier}\n` +
    `🔖 *AWB / Tracking Code:* ${awb}\n` +
    `🔗 *Live Tracking Link:* ${trackingUrl}\n\n` +
    `Thank you for choosing Fatima Calligrapher! ✨`;

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

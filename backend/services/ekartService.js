const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

let cachedToken = null;
let tokenExpiresAt = 0;

const isConfigured = Boolean(
  config.ekart &&
  config.ekart.clientId &&
  config.ekart.username &&
  config.ekart.password
);

const ekartService = {
  isConfigured: () => isConfigured,

  /**
   * Fetch Bearer JWT authentication token from Ekart Elite API
   * Endpoint: POST /integrations/v2/auth/token/{client_id}
   */
  getAuthToken: async () => {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now + 60000) {
      return cachedToken;
    }

    const { clientId, username, password, baseUrl } = config.ekart;
    const authUrl = `${baseUrl}/integrations/v2/auth/token/${encodeURIComponent(clientId)}`;

    logger.info('EKART_AUTHENTICATING', { clientId, username });

    try {
      const response = await axios.post(
        authUrl,
        { username, password },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 15000
        }
      );

      const token = response.data?.access_token;
      if (!token) {
        throw new Error(response.data?.message || 'No access_token returned by Ekart Auth API.');
      }

      cachedToken = token;
      // Expires in seconds (defaults to 24 hours)
      const expiresInSec = response.data?.expires_in || 86400;
      tokenExpiresAt = now + expiresInSec * 1000;

      logger.info('EKART_AUTHENTICATION_SUCCESS', {
        expiresInSec,
        tokenExpiresAt: new Date(tokenExpiresAt).toISOString()
      });

      return token;
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      logger.error('EKART_AUTHENTICATION_FAILED', { error: errMsg });
      throw new Error(`Ekart authentication failed: ${errMsg}`);
    }
  },

  /**
   * Create order in Ekart Logistics Elite System
   * Endpoint: POST /integrations/order/create
   */
  createShipment: async (order, options = {}) => {
    if (!isConfigured) {
      throw new Error('Ekart credentials are not configured in environment variables.');
    }

    const token = await ekartService.getAuthToken();
    const { baseUrl } = config.ekart;

    // Detect Payment mode: Prepaid vs COD
    const prov = (order.payment?.provider || order.paymentMethod || '').toLowerCase();
    const isAlreadyPaid = prov === 'razorpay' && order.payment?.status === 'CAPTURED';
    const isCod = options.convertToCod ? true : (!isAlreadyPaid || prov === 'cod');

    // Customer info sanitization (with multi-field fallbacks)
    const customer = order.customer || order.shippingAddress || {};
    const shippingAddr = order.shippingAddress || {};
    const fullName = (customer.name || customer.fullName || shippingAddr.fullName || shippingAddr.name || 'Customer').trim();
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || '';

    const cleanPhone = String(customer.phone || customer.mobile || shippingAddr.phone || shippingAddr.mobile || '').replace(/\D/g, '').slice(-10);
    const rawPin = String(customer.pincode || shippingAddr.pincode || '').replace(/\D/g, '').slice(0, 6);
    const intPincode = parseInt(rawPin, 10);

    if (!intPincode || rawPin.length !== 6) {
      throw new Error(`Invalid 6-digit delivery pincode: ${customer.pincode || shippingAddr.pincode}`);
    }
    if (!cleanPhone || cleanPhone.length !== 10) {
      throw new Error(`Invalid 10-digit customer phone number: ${customer.phone || shippingAddr.phone}`);
    }

    const addressLine1 = customer.address1 || customer.address || customer.addressLine1 || shippingAddr.address1 || shippingAddr.address || shippingAddr.addressLine1 || '';
    const addressLine2 = customer.address2 || customer.addressLine2 || shippingAddr.address2 || shippingAddr.addressLine2 || '';
    const fullAddress = [addressLine1, addressLine2].filter(Boolean).join(', ') || 'Address Provided on Checkout';
    const city = customer.city || shippingAddr.city || 'City';
    const state = customer.state || shippingAddr.state || 'State';

    // Pricing: Preserve the exact prepaid discounted price as requested!
    const totalAmount = Math.round(
      order.pricing?.total ||
      (order.payment?.amountPaise ? order.payment.amountPaise / 100 : 0) ||
      599
    );

    // Items array
    const orderItems = (order.items && order.items.length > 0) ? order.items : [
      { name: 'Islamic Flashcards Kit', price: totalAmount, quantity: 1 }
    ];

    const mappedItems = orderItems.map(item => ({
      name: String(item.name || item.title || 'Product Item').slice(0, 100),
      retail_price: Math.max(1, Math.round(item.price || item.unitPrice || (totalAmount / (item.quantity || 1)))),
      quantity: Math.max(1, parseInt(item.quantity, 10) || 1)
    }));

    const payload = {
      order_id: String(order.orderId),
      shipping_address: {
        first_name: firstName,
        last_name: lastName,
        address_line: fullAddress,
        city: city,
        state: state,
        pincode: intPincode,
        mobile: cleanPhone
      },
      payments: {
        payment_mode: isCod ? 'COD' : 'Prepaid',
        amount: totalAmount
      },
      items: mappedItems
    };

    logger.info('EKART_CREATING_ORDER', {
      orderId: order.orderId,
      paymentMode: payload.payments.payment_mode,
      amount: payload.payments.amount,
      pincode: intPincode
    });

    try {
      const response = await axios.post(
        `${baseUrl}/integrations/order/create`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 20000
        }
      );

      const resData = response.data;
      logger.info('EKART_CREATE_ORDER_RESPONSE', {
        orderId: order.orderId,
        status: response.status,
        data: resData
      });

      const ekartOrder = resData.data;
      const ekartId = ekartOrder?._id || ekartOrder?.id || ekartOrder?.order_id || String(order.orderId);
      const subOrders = ekartOrder?.subOrders || ekartOrder?.sub_orders || [];
      const primarySubOrder = subOrders[0] || {};
      const subOrderId = primarySubOrder.id || primarySubOrder.suborder_id || ekartId;
      const subOrderStatus = primarySubOrder.status || 'Ready to Ship';

      return {
        provider: 'ekart',
        status: 'READY_TO_SHIP',
        ekartOrderId: ekartId,
        awb: subOrderId,
        subOrderId: subOrderId,
        courierName: 'Ekart Logistics',
        subOrderStatus: subOrderStatus,
        totalAmount: totalAmount,
        paymentMode: isCod ? 'COD' : 'Prepaid',
        trackingUrl: subOrderId ? `https://app.elite.ekartlogistics.in/track/${encodeURIComponent(subOrderId)}` : 'https://app.elite.ekartlogistics.in/track',
        bookedAt: new Date().toISOString()
      };
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      const details = err.response?.data?.errors || err.response?.data?.error || null;
      logger.error('EKART_CREATE_ORDER_FAILED', {
        orderId: order.orderId,
        error: errMsg,
        details
      });
      throw new Error(`Ekart order placement failed: ${errMsg}${details ? ` (${JSON.stringify(details)})` : ''}`);
    }
  }
};

module.exports = ekartService;

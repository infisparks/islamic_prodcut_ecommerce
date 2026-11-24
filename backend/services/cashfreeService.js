const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../utils/logger');

const isConfigured = Boolean(
  config.cashfree &&
  config.cashfree.appId &&
  config.cashfree.secretKey
);

const cashfreeService = {
  isConfigured: () => isConfigured,

  getAppId: () => config.cashfree?.appId || '',
  getEnv: () => config.cashfree?.env || 'production',

  /**
   * Helper to get request headers for Cashfree PG API
   */
  getHeaders: () => {
    return {
      'x-client-id': config.cashfree.appId,
      'x-client-secret': config.cashfree.secretKey,
      'x-api-version': config.cashfree.apiVersion || '2023-08-01',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  },

  /**
   * Create a Cashfree Payment Order Session
   * API: POST /pg/orders
   * @param {Object} params
   * @param {string} params.internalOrderId - e.g. FC-20261125-XXXXXXXX
   * @param {number} params.amountInRupees - Total order amount in INR
   * @param {Object} params.customer - { name, phone, email, address1, city, state, pincode }
   * @param {string} [params.returnUrl] - Optional custom return URL
   * @param {string} [params.notifyUrl] - Optional custom webhook URL
   */
  createOrder: async ({ internalOrderId, amountInRupees, customer, returnUrl, notifyUrl }) => {
    if (!isConfigured) {
      throw new Error('Cashfree credentials are not configured.');
    }

    const { baseUrl } = config.cashfree;
    const cleanPhone = String(customer.phone || '').replace(/\D/g, '').slice(-10) || '9999999999';
    const customerName = (customer.name || customer.fullName || 'Customer').trim();
    const customerEmail = customer.email || `${cleanPhone}@fatimacalligrapher.com`;

    const roundedAmount = Math.max(1, parseFloat(Number(amountInRupees).toFixed(2)));

    const payload = {
      order_id: String(internalOrderId),
      order_amount: roundedAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${cleanPhone}`,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: cleanPhone
      },
      order_meta: {
        return_url: returnUrl || `https://fatimacalligrapher27.com/order-status.html?order_id={order_id}`,
        notify_url: notifyUrl || `https://fatimacalligrapher27.com/api/webhooks/cashfree`
      },
      order_note: `Order #${internalOrderId} at Fatima Calligrapher`
    };

    logger.info('CASHFREE_CREATING_ORDER', {
      internalOrderId,
      amount: roundedAmount,
      customerPhone: cleanPhone
    });

    try {
      const response = await axios.post(
        `${baseUrl}/orders`,
        payload,
        {
          headers: cashfreeService.getHeaders(),
          timeout: 15000
        }
      );

      const cfData = response.data;
      logger.info('CASHFREE_ORDER_CREATED_SUCCESS', {
        internalOrderId,
        cfOrderId: cfData.cf_order_id,
        orderStatus: cfData.order_status,
        hasPaymentSessionId: Boolean(cfData.payment_session_id)
      });

      return {
        orderId: internalOrderId,
        cfOrderId: cfData.cf_order_id,
        paymentSessionId: cfData.payment_session_id,
        orderStatus: cfData.order_status,
        orderAmount: cfData.order_amount,
        orderCurrency: cfData.order_currency,
        environment: config.cashfree.env
      };
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      const errCode = err.response?.data?.code || 'CASHFREE_CREATE_FAILED';
      logger.error('CASHFREE_CREATE_ORDER_FAILED', {
        internalOrderId,
        error: errMsg,
        details: err.response?.data
      });
      throw new Error(`Cashfree order creation failed: ${errMsg} (${errCode})`);
    }
  },

  /**
   * Fetch order status from Cashfree
   * API: GET /pg/orders/{order_id}
   */
  getOrder: async (orderId) => {
    if (!isConfigured) throw new Error('Cashfree credentials are not configured.');
    const { baseUrl } = config.cashfree;

    try {
      const response = await axios.get(
        `${baseUrl}/orders/${encodeURIComponent(orderId)}`,
        {
          headers: cashfreeService.getHeaders(),
          timeout: 10000
        }
      );
      return response.data;
    } catch (err) {
      logger.error('CASHFREE_GET_ORDER_FAILED', { orderId, error: err.response?.data || err.message });
      throw err;
    }
  },

  /**
   * Fetch payments for an order from Cashfree
   * API: GET /pg/orders/{order_id}/payments
   */
  getOrderPayments: async (orderId) => {
    if (!isConfigured) throw new Error('Cashfree credentials are not configured.');
    const { baseUrl } = config.cashfree;

    try {
      const response = await axios.get(
        `${baseUrl}/orders/${encodeURIComponent(orderId)}/payments`,
        {
          headers: cashfreeService.getHeaders(),
          timeout: 10000
        }
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      logger.error('CASHFREE_GET_PAYMENTS_FAILED', { orderId, error: err.response?.data || err.message });
      return [];
    }
  },

  /**
   * Verify Cashfree Webhook Signature
   * Signature calculation: HMAC-SHA256(timestamp + rawBody, secretKey) in base64
   * @param {string} rawBody
   * @param {string} signature - Header 'x-webhook-signature'
   * @param {string} timestamp - Header 'x-webhook-timestamp'
   */
  verifyWebhookSignature: (rawBody, signature, timestamp) => {
    if (!signature || !timestamp || !config.cashfree.secretKey) {
      return false;
    }

    try {
      const dataToSign = `${timestamp}${rawBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', config.cashfree.secretKey)
        .update(dataToSign)
        .digest('base64');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err) {
      logger.error('CASHFREE_SIGNATURE_VERIFY_ERROR', { error: err.message });
      return false;
    }
  }
};

module.exports = cashfreeService;

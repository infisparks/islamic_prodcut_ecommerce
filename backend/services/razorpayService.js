const Razorpay = require('razorpay');
const config = require('../config/env');
const logger = require('../utils/logger');
const { verifyHmacSignature, generateHmacSha256 } = require('../utils/crypto');

let razorpayInstance = null;
const isConfigured =
  config.razorpay.keyId &&
  config.razorpay.keySecret &&
  !config.razorpay.keyId.includes('dummy');

if (isConfigured) {
  try {
    razorpayInstance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret
    });
    logger.info('RAZORPAY_CLIENT_INITIALIZED', { keyId: config.razorpay.keyId });
  } catch (err) {
    logger.warn('RAZORPAY_INIT_ERROR', { message: err.message });
  }
}

const razorpayService = {
  getKeyId: () => config.razorpay.keyId,

  // Create Razorpay Order
  createOrder: async ({ internalOrderId, amountInPaise, currency = 'INR', customer = {} }) => {
    try {
      if (razorpayInstance) {
        try {
          const order = await razorpayInstance.orders.create({
            amount: amountInPaise,
            currency: currency,
            receipt: internalOrderId,
            notes: {
              internalOrderId,
              customerName: customer.name || '',
              customerPhone: customer.phone || ''
            }
          });

          logger.info('RAZORPAY_ORDER_CREATED_REMOTE', {
            internalOrderId,
            razorpayOrderId: order.id,
            amount: amountInPaise
          });

          return order;
        } catch (apiErr) {
          const errMsg = (apiErr.error && apiErr.error.description) || apiErr.message;
          
          if (errMsg.toLowerCase().includes('authentication failed')) {
            logger.error('RAZORPAY_CREDENTIALS_INVALID', {
              internalOrderId,
              error: errMsg,
              keyId: config.razorpay.keyId
            });
            const customErr = new Error('Razorpay Authentication Failed. Your Key ID or Key Secret in .env is invalid. Please generate a new key in Razorpay Dashboard > Settings > API Keys.');
            customErr.statusCode = 400;
            customErr.code = 'RAZORPAY_AUTH_FAILED';
            customErr.isPublic = true;
            throw customErr;
          }

          throw apiErr;
        }
      }

      // If keys are not configured at all (mock store mode)
      const mockRazorpayOrderId = `order_${Math.random().toString(36).substring(2, 16)}`;
      return {
        id: mockRazorpayOrderId,
        entity: 'order',
        amount: amountInPaise,
        currency,
        receipt: internalOrderId,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000)
      };
    } catch (err) {
      logger.error('RAZORPAY_ORDER_CREATION_FAILED', {
        internalOrderId,
        error: err.message
      });
      throw err;
    }
  },

  // Verify Payment Signature using timing-safe HMAC SHA256
  verifyPaymentSignature: ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const isValid = verifyHmacSignature(payload, razorpay_signature, config.razorpay.keySecret);
    return isValid;
  },

  // Verify Webhook Signature
  verifyWebhookSignature: (rawBodyBuffer, signatureHeader) => {
    if (!config.razorpay.webhookSecret) {
      logger.warn('RAZORPAY_WEBHOOK_SECRET_NOT_CONFIGURED');
      return false;
    }
    const expectedSignature = generateHmacSha256(rawBodyBuffer, config.razorpay.webhookSecret);
    return verifyHmacSignature(rawBodyBuffer, signatureHeader, config.razorpay.webhookSecret, expectedSignature);
  },

  _generateWebhookSignatureForTest: (payloadString) => {
    return generateHmacSha256(payloadString, config.razorpay.webhookSecret || 'fc_rzp_webhook_secret_mantasha');
  },

  _generatePaymentSignatureForTest: (orderId, paymentId) => {
    return generateHmacSha256(`${orderId}|${paymentId}`, config.razorpay.keySecret || 'dummy_razorpay_secret');
  }
};

module.exports = razorpayService;

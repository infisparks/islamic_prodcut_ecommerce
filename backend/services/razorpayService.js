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
          if (config.paymentMode === 'test') {
            logger.warn('RAZORPAY_API_TEST_SIMULATION', {
              internalOrderId,
              reason: apiErr.error ? apiErr.error.description : apiErr.message
            });
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
          }
          throw apiErr;
        }
      }

      // Mock / Test Mode Fallback
      const mockRazorpayOrderId = `order_${Math.random().toString(36).substring(2, 16)}`;
      logger.info('RAZORPAY_ORDER_CREATED_LOCAL', {
        internalOrderId,
        razorpayOrderId: mockRazorpayOrderId,
        amount: amountInPaise
      });

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

    if (isValid) {
      logger.info('RAZORPAY_PAYMENT_VERIFIED', {
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      });
    } else {
      logger.warn('RAZORPAY_PAYMENT_VERIFICATION_FAILED', {
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      });
    }

    return isValid;
  },

  // Verify Webhook Signature using raw body buffer
  verifyWebhookSignature: (rawBody, signatureHeader) => {
    if (!signatureHeader || !config.razorpay.webhookSecret) {
      return false;
    }

    return verifyHmacSignature(rawBody, signatureHeader, config.razorpay.webhookSecret);
  },

  _generateSignatureForTest: (razorpay_order_id, razorpay_payment_id) => {
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    return generateHmacSha256(payload, config.razorpay.keySecret);
  },

  _generateWebhookSignatureForTest: (rawBody) => {
    return generateHmacSha256(rawBody, config.razorpay.webhookSecret);
  }
};

module.exports = razorpayService;

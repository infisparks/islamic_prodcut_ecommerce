const express = require('express');
const router = express.Router();

const { validateOrderCreation } = require('../middleware/validation');
const { orderCreateLimiter } = require('../middleware/rateLimit');
const { buildTrustedOrderItems } = require('../services/catalogService');
const firebaseService = require('../services/firebaseService');
const razorpayService = require('../services/razorpayService');
const shiprocketService = require('../services/shiprocketService');
const whatsappService = require('../services/whatsappService');
const { generateOrderId } = require('../utils/crypto');
const logger = require('../utils/logger');

// In-memory COD OTP Store (Phone -> { otp, expiresAt, attempts, verified, verificationToken })
const codOtpStore = new Map();

/**
 * POST /api/orders/send-cod-otp
 * Send 4-digit OTP via WhatsApp for COD order verification
 */
router.post('/send-cod-otp', async (req, res, next) => {
  try {
    const { phone } = req.body;
    const cleanPhone = String(phone || '').replace(/\D/g, '');

    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PHONE',
          message: 'Please provide a valid 10-digit Indian mobile number.'
        }
      });
    }

    // Check 24-hour daily COD limit (Max 3 COD orders per phone number per day)
    const existingCodCount = await firebaseService.getCodOrderCountInLast24Hours(cleanPhone);
    if (existingCodCount >= 3) {
      logger.warn('COD_DAILY_LIMIT_EXCEEDED', { phone: cleanPhone, count: existingCodCount });
      return res.status(400).json({
        success: false,
        error: {
          code: 'COD_DAILY_LIMIT_EXCEEDED',
          message: 'You have reached the maximum limit of 3 Cash on Delivery (COD) orders per day. Please choose Online Payment via Razorpay or try again tomorrow.'
        }
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // Increased to 15 minutes validity

    codOtpStore.set(cleanPhone, {
      otp,
      expiresAt,
      attempts: 0,
      verified: false,
      verificationToken: null
    });

    logger.info('COD_OTP_SENT', { phone: cleanPhone });

    // Trigger WhatsApp Evolution API dispatch asynchronously for sub-100ms instant UI response
    whatsappService.sendCodOtpWhatsApp(cleanPhone, otp).catch(err => {
      logger.error('ASYNC_COD_OTP_SEND_ERROR', { phone: cleanPhone, error: err.message });
    });

    return res.json({
      success: true,
      message: 'Verification OTP sent to your WhatsApp number.',
      cooldownSeconds: 10
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/verify-cod-otp
 * Verify WhatsApp OTP code (max 3 attempts limit)
 */
router.post('/verify-cod-otp', async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const cleanOtp = String(otp || '').trim();

    const record = codOtpStore.get(cleanPhone);
    if (!record) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'OTP_NOT_FOUND',
          message: 'No active OTP found. Please click Resend OTP.'
        }
      });
    }

    if (Date.now() > record.expiresAt) {
      codOtpStore.delete(cleanPhone);
      return res.status(400).json({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'OTP has expired. Please click Resend OTP to get a new code.'
        }
      });
    }

    if (record.attempts >= 3) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: 'Maximum 3 incorrect attempts reached. Please click Resend OTP.'
        }
      });
    }

    if (record.otp !== cleanOtp) {
      record.attempts += 1;
      const attemptsLeft = 3 - record.attempts;
      return res.status(400).json({
        success: false,
        attemptsLeft,
        error: {
          code: 'INVALID_OTP',
          message: record.attempts >= 3
            ? 'Maximum 3 attempts exceeded. Please click Resend OTP.'
            : `Invalid OTP code. You have ${attemptsLeft} attempt(s) remaining.`
        }
      });
    }

    // OTP Validated successfully
    const verificationToken = `cod_verified_${cleanPhone}_${Date.now()}`;
    record.verified = true;
    record.verificationToken = verificationToken;

    return res.json({
      success: true,
      message: 'Mobile number verified successfully!',
      verificationToken
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/create
 * Creates a new order authoritatively from server catalog.
 */
router.post('/create', orderCreateLimiter, validateOrderCreation, async (req, res, next) => {
  try {
    const { customer, items, paymentMethod, verificationToken } = req.sanitizedOrder;
    const reqVerificationToken = req.body.verificationToken || verificationToken;

    // Verify mandatory COD OTP & Daily limit before proceeding
    if (paymentMethod === 'cod') {
      const cleanPhone = String(customer.phone || '').replace(/\D/g, '');

      // Verify 24-hour daily COD limit (Max 3 COD orders per phone number per day)
      const existingCodCount = await firebaseService.getCodOrderCountInLast24Hours(cleanPhone);
      if (existingCodCount >= 3) {
        logger.warn('COD_DAILY_LIMIT_EXCEEDED_CREATE', { phone: cleanPhone, count: existingCodCount });
        return res.status(400).json({
          success: false,
          error: {
            code: 'COD_DAILY_LIMIT_EXCEEDED',
            message: 'You have reached the maximum limit of 3 Cash on Delivery (COD) orders per day. Please choose Online Payment via Razorpay or try again tomorrow.'
          }
        });
      }

      const record = codOtpStore.get(cleanPhone);
      const isValidToken = record && record.verified && (record.verificationToken === reqVerificationToken || process.env.NODE_ENV === 'development');
      if (!isValidToken && process.env.NODE_ENV !== 'test') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'COD_OTP_REQUIRED',
            message: 'WhatsApp OTP verification is required before confirming a Cash on Delivery order.'
          }
        });
      }
    }

    // 1. Calculate trusted cart pricing, weights, dimensions with dynamic pincode shipping
    const trustedOrderData = await buildTrustedOrderItems(items, customer.pincode);
    const internalOrderId = generateOrderId();
    const now = new Date().toISOString();

    const orderRecord = {
      orderId: internalOrderId,
      createdAt: now,
      status: paymentMethod === 'cod' ? 'COD_PENDING' : 'PENDING_PAYMENT',
      customer,
      items: trustedOrderData.items,
      pricing: trustedOrderData.pricing,
      package: trustedOrderData.package,
      inventoryStatus: trustedOrderData.inventoryStatus,
      payment: {
        provider: paymentMethod === 'cod' ? 'COD' : 'razorpay',
        status: paymentMethod === 'cod' ? 'COD_PENDING' : 'CREATED',
        amountPaise: trustedOrderData.pricing.total * 100,
        currency: 'INR',
        razorpayOrderId: null,
        razorpayPaymentId: null,
        paidAt: null
      },
      shipping: {
        provider: 'shiprocket',
        status: 'NOT_BOOKED',
        shiprocketOrderId: null,
        shipmentId: null,
        awb: null,
        courierName: null,
        trackingUrl: null,
        bookedAt: null,
        lastTrackingUpdate: null
      },
      events: [
        {
          event: 'ORDER_INITIATED',
          timestamp: now,
          details: `Order created via ${paymentMethod.toUpperCase()}`
        }
      ]
    };

    // 2. Handle Razorpay flow
    if (paymentMethod === 'razorpay') {
      const amountPaise = trustedOrderData.pricing.total * 100;

      const rzpOrder = await razorpayService.createOrder({
        internalOrderId,
        amountInPaise: amountPaise,
        currency: 'INR',
        customer
      });

      orderRecord.payment.razorpayOrderId = rzpOrder.id;
      orderRecord.status = 'PENDING_PAYMENT';

      await firebaseService.saveOrder(internalOrderId, orderRecord);
      logger.info('ORDER_CREATED', { internalOrderId, paymentMethod: 'razorpay', amountPaise });

      return res.status(201).json({
        success: true,
        data: {
          orderId: internalOrderId,
          razorpayOrderId: rzpOrder.id,
          razorpayKeyId: razorpayService.getKeyId(),
          amount: amountPaise,
          currency: 'INR',
          pricing: trustedOrderData.pricing,
          itemsCount: trustedOrderData.items.reduce((s, i) => s + i.quantity, 0)
        }
      });
    }

    // 3. Handle COD flow
    if (paymentMethod === 'cod') {
      logger.info('ORDER_CREATED_COD_INITIATED', { internalOrderId });

      // Automatically book Shiprocket for COD
      try {
        const shippingDetails = await shiprocketService.createShipment(orderRecord);
        orderRecord.shipping = {
          ...orderRecord.shipping,
          ...shippingDetails
        };
        orderRecord.status = 'SHIPMENT_BOOKED';
        orderRecord.events.push({
          event: 'SHIPMENT_BOOKED',
          timestamp: new Date().toISOString(),
          details: `Shiprocket shipment confirmed with Order ID ${shippingDetails.shiprocketOrderId}`
        });

        await firebaseService.saveOrder(internalOrderId, orderRecord);
        logger.info('ORDER_CREATED_COD_SUCCESS', { internalOrderId, shiprocketOrderId: shippingDetails.shiprocketOrderId });

        // Dispatch WhatsApp Order & Shipping notifications
        whatsappService.sendOrderConfirmationWhatsApp(orderRecord).catch(err => {
          logger.error('WHATSAPP_COD_CONFIRM_FAIL', { orderId: internalOrderId, error: err.message });
        });
        whatsappService.sendShippingConfirmationWhatsApp(orderRecord).catch(err => {
          logger.error('WHATSAPP_COD_SHIPPING_FAIL', { orderId: internalOrderId, error: err.message });
        });

        return res.status(201).json({
          success: true,
          data: {
            orderId: internalOrderId,
            status: orderRecord.status,
            payment: {
              provider: 'COD',
              status: 'COD_PENDING'
            },
            shipping: orderRecord.shipping,
            pricing: trustedOrderData.pricing,
            customer: orderRecord.customer
          }
        });
      } catch (shipErr) {
        logger.error('COD_SHIPMENT_FAILED', { internalOrderId, error: shipErr.message });
        orderRecord.shipping.status = 'FAILED';
        orderRecord.status = 'SHIPMENT_FAILED';
        orderRecord.events.push({
          event: 'SHIPMENT_FAILED',
          timestamp: new Date().toISOString(),
          details: `Shipping booking failed: ${shipErr.message}`
        });
        await firebaseService.saveOrder(internalOrderId, orderRecord);

        // Even if shipment creation failed, send Order Confirmation WhatsApp
        whatsappService.sendOrderConfirmationWhatsApp(orderRecord).catch(e => {});

        return res.status(400).json({
          success: false,
          error: {
            code: 'SHIPROCKET_CONFIRMATION_FAILED',
            message: shipErr.message || 'Shiprocket could not confirm shipment booking.'
          }
        });
      }
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:orderId
 * Retrieve full sanitized order data
 */
router.get('/:orderId', async (req, res, next) => {
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

    res.json({
      success: true,
      data: order
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:orderId/status
 * Retrieve order, payment, and shipping status summary
 */
router.get('/:orderId/status', async (req, res, next) => {
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

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.payment ? order.payment.status : 'UNKNOWN',
        shippingStatus: order.shipping ? order.shipping.status : 'NOT_BOOKED',
        awb: order.shipping ? order.shipping.awb : null,
        courierName: order.shipping ? order.shipping.courierName : null,
        trackingUrl: order.shipping ? order.shipping.trackingUrl : null
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

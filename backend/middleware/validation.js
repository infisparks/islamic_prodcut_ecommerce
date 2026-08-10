/**
 * Request Validation & Sanitization Middleware
 */

function sanitizeString(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  // Remove HTML tags, null bytes, and trim whitespace
  const clean = str
    .replace(/<[^>]*>?/gm, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
  return clean.substring(0, maxLen);
}

function validateOrderCreation(req, res, next) {
  const { customer, items, paymentMethod } = req.body;

  if (!customer || typeof customer !== 'object') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CUSTOMER_DATA',
        message: 'Customer information is required.'
      }
    });
  }

  // Sanitize fields
  const name = sanitizeString(customer.name, 100);
  const phone = String(customer.phone || '').replace(/\D/g, '').slice(-10); // Extract last 10 digits
  const pincode = String(customer.pincode || '').replace(/\D/g, '').slice(0, 6); // Extract 6 digits
  const address1 = sanitizeString(customer.address1, 200);
  const address2 = sanitizeString(customer.address2 || '', 200);
  const city = sanitizeString(customer.city, 100);
  const state = sanitizeString(customer.state, 100);

  // Validate Name
  if (!name || name.length < 2) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_NAME',
        message: 'Recipient full name is required (at least 2 characters).'
      }
    });
  }

  // Validate Indian Mobile: 10 digits starting with 6, 7, 8, 9
  if (!phone || phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PHONE',
        message: 'Please enter a valid 10-digit Indian mobile number.'
      }
    });
  }

  // Validate 6-digit Indian Pincode
  if (!pincode || pincode.length !== 6 || !/^[1-9][0-9]{5}$/.test(pincode)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PINCODE',
        message: 'Please enter a valid 6-digit Indian delivery pincode.'
      }
    });
  }

  // Validate Address fields
  if (!address1 || address1.length < 5) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_ADDRESS',
        message: 'Address line 1 (Flat/House/Building) is required.'
      }
    });
  }

  if (!city || city.length < 2) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CITY',
        message: 'City/District is required.'
      }
    });
  }

  if (!state || state.length < 2) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: 'State is required.'
      }
    });
  }

  // Validate Items Array
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'EMPTY_CART',
        message: 'Order items cannot be empty.'
      }
    });
  }

  // Validate individual item structures
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.sku || typeof item.sku !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ITEM_SKU',
          message: `Item at index ${i} is missing a valid SKU.`
        }
      });
    }

    const qty = parseInt(item.quantity, 10);
    if (isNaN(qty) || qty <= 0 || qty > 50) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ITEM_QUANTITY',
          message: `Quantity for SKU ${item.sku} must be between 1 and 50.`
        }
      });
    }
  }

  // Validate payment method if supplied
  const method = (paymentMethod || 'razorpay').toLowerCase();
  if (!['razorpay', 'cod'].includes(method)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PAYMENT_METHOD',
        message: 'Payment method must be either razorpay or cod.'
      }
    });
  }

  const emergencyPhone = customer.emergencyPhone ? sanitizeString(customer.emergencyPhone, 15) : null;

  // Attach sanitized data to request
  req.sanitizedOrder = {
    customer: {
      name,
      phone,
      emergencyPhone,
      pincode,
      address1,
      address2,
      city,
      state,
      country: 'India'
    },
    items: items.map(it => ({
      sku: sanitizeString(it.sku, 50),
      quantity: parseInt(it.quantity, 10)
    })),
    paymentMethod: method,
    couponCode: req.body.couponCode ? sanitizeString(req.body.couponCode, 20) : null
  };

  next();
}

function validatePaymentVerification(req, res, next) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || typeof razorpay_order_id !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_RAZORPAY_ORDER_ID',
        message: 'Razorpay order ID is required.'
      }
    });
  }

  if (!razorpay_payment_id || typeof razorpay_payment_id !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_RAZORPAY_PAYMENT_ID',
        message: 'Razorpay payment ID is required.'
      }
    });
  }

  if (!razorpay_signature || typeof razorpay_signature !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_RAZORPAY_SIGNATURE',
        message: 'Razorpay signature is required.'
      }
    });
  }

  next();
}

module.exports = {
  validateOrderCreation,
  validatePaymentVerification,
  sanitizeString
};

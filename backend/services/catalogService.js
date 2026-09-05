const { findItemBySku } = require('../config/catalog');

/**
 * Authoritatively calculates cart items and total pricing from server catalog
 */
async function buildTrustedOrderItems(rawItems, deliveryPincode, couponCode = null, paymentMethod = 'razorpay') {
  let subtotal = 0;
  let totalWeightKg = 0;
  let maxDimensions = { length: 15, breadth: 10, height: 2.5 }; // base package dimensions

  const items = [];

  for (const rawItem of rawItems) {
    const catalogItem = findItemBySku(rawItem.sku);
    if (!catalogItem) {
      const err = new Error(`Item with SKU [${rawItem.sku}] was not found in the product catalog.`);
      err.statusCode = 400;
      err.code = 'INVALID_SKU';
      err.isPublic = true;
      throw err;
    }

    const qty = parseInt(rawItem.quantity, 10);
    const lineTotal = catalogItem.unitPrice * qty;
    const lineWeight = catalogItem.weightKg * qty;

    subtotal += lineTotal;
    totalWeightKg += lineWeight;

    // Expand package height for multiple items
    if (catalogItem.dimensions) {
      maxDimensions.length = Math.max(maxDimensions.length, catalogItem.dimensions.length);
      maxDimensions.breadth = Math.max(maxDimensions.breadth, catalogItem.dimensions.breadth);
    }

    items.push({
      productId: catalogItem.productId,
      sku: catalogItem.sku,
      name: catalogItem.productName,
      variantName: catalogItem.variantName,
      quantity: qty,
      unitPrice: catalogItem.unitPrice,
      totalPrice: lineTotal,
      weightKg: catalogItem.weightKg,
      weightLabel: catalogItem.weightLabel,
      hsn: catalogItem.hsn
    });
  }

  // Round weight to 3 decimal places, min 0.05kg
  const finalWeightKg = Math.max(0.05, Math.round(totalWeightKg * 1000) / 1000);
  
  // Calculate dynamic shipping fee:
  // - Orders >= Rs. 699 get 100% FREE Delivery on BOTH COD and Prepaid
  // - Orders < Rs. 699 have shipping charges for BOTH COD and Prepaid
  const isFreeShipping = (subtotal >= 699);
  const isOnlinePayment = (paymentMethod !== 'cod');
  let shipping = 0;

  if (!isFreeShipping) {
    if (deliveryPincode) {
      const shiprocketService = require('./shiprocketService');
      try {
        const servRes = await shiprocketService.checkServiceability(deliveryPincode, !isOnlinePayment, finalWeightKg);
        if (servRes.isServiceable && typeof servRes.shippingCharge === 'number') {
          shipping = servRes.shippingCharge;
        } else {
          shipping = shiprocketService.calculateShippingCharge(deliveryPincode, finalWeightKg);
        }
      } catch (e) {
        shipping = shiprocketService.calculateShippingCharge(deliveryPincode, finalWeightKg);
      }
    } else {
      shipping = 49; // Default courier charge when pincode is not yet specified
    }
  }

  // Automatic 12% Discount for orders >= Rs. 999 (Code RAB112)
  let discount = 0;
  let appliedCoupon = null;

  if (subtotal >= 999) {
    discount = Math.round(subtotal * 0.12);
    appliedCoupon = 'RAB112';
  } else if (couponCode && typeof couponCode === 'string') {
    const cleanCoupon = couponCode.trim().toUpperCase();
    if (cleanCoupon === 'RAB112') {
      const err = new Error('Coupon RAB112 requires a minimum order of ₹999.');
      err.statusCode = 400;
      err.code = 'COUPON_MIN_AMOUNT_NOT_MET';
      err.isPublic = true;
      throw err;
    } else {
      const err = new Error(`Invalid coupon code [${couponCode}]. Use coupon RAB112.`);
      err.statusCode = 400;
      err.code = 'INVALID_COUPON';
      err.isPublic = true;
      throw err;
    }
  }

  // Prepaid (Online Payment) gets an extra 5% Discount
  let onlineDiscount = 0;
  if (isOnlinePayment) {
    onlineDiscount = Math.round(subtotal * 0.05);
  }

  let codCharge = 0;

  const total = Math.max(0, subtotal - discount - onlineDiscount + codCharge + shipping);

  return {
    items,
    pricing: {
      subtotal,
      discount,
      couponCode: appliedCoupon,
      onlineDiscount,
      codCharge,
      shipping,
      total,
      currency: 'INR'
    },
    package: {
      weightKg: finalWeightKg,
      dimensions: maxDimensions
    },
    inventoryStatus: 'IN_STOCK'
  };
}

module.exports = {
  buildTrustedOrderItems
};

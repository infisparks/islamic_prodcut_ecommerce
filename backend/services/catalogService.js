const { findItemBySku } = require('../config/catalog');

/**
 * Authoritatively calculates cart items and total pricing from server catalog
 */
async function buildTrustedOrderItems(rawItems, deliveryPincode, couponCode = null) {
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
  
  // Calculate dynamic shipping fee live via Shiprocket courier API
  let shipping = 0;
  if (deliveryPincode) {
    const shiprocketService = require('./shiprocketService');
    try {
      const servRes = await shiprocketService.checkServiceability(deliveryPincode, true, finalWeightKg);
      if (servRes.isServiceable && typeof servRes.shippingCharge === 'number') {
        shipping = servRes.shippingCharge;
      } else {
        shipping = shiprocketService.calculateShippingCharge(deliveryPincode, finalWeightKg);
      }
    } catch (e) {
      shipping = shiprocketService.calculateShippingCharge(deliveryPincode, finalWeightKg);
    }
  }

  // Free delivery ONLY if order subtotal is more than or equal to Rs. 999
  if (subtotal >= 999) {
    shipping = 0;
  }

  // Coupon Code Validation (RAB112 -> 12% OFF for orders >= Rs. 999)
  let discount = 0;
  let appliedCoupon = null;

  if (couponCode && typeof couponCode === 'string') {
    const cleanCoupon = couponCode.trim().toUpperCase();
    if (cleanCoupon === 'RAB112') {
      if (subtotal < 999) {
        const err = new Error('Coupon RAB112 requires a minimum order of ₹999.');
        err.statusCode = 400;
        err.code = 'COUPON_MIN_AMOUNT_NOT_MET';
        err.isPublic = true;
        throw err;
      }
      discount = Math.round(subtotal * 0.12);
      appliedCoupon = 'RAB112';
    } else {
      const err = new Error(`Invalid coupon code [${couponCode}]. Use coupon RAB112.`);
      err.statusCode = 400;
      err.code = 'INVALID_COUPON';
      err.isPublic = true;
      throw err;
    }
  }

  const total = Math.max(0, subtotal - discount + shipping);

  return {
    items,
    pricing: {
      subtotal,
      discount,
      couponCode: appliedCoupon,
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

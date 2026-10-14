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

    const isCombo = catalogItem.hasJanamaz;
    let cleanJanamazColor = null;
    if (rawItem.janamazColor && typeof rawItem.janamazColor === 'string') {
      cleanJanamazColor = rawItem.janamazColor.trim().slice(0, 50);
    } else if (isCombo) {
      cleanJanamazColor = 'Royal Gold'; // default color if not specified
    }

    items.push({
      productId: catalogItem.productId,
      sku: catalogItem.sku,
      name: catalogItem.productName,
      variantName: catalogItem.variantName,
      hasJanamaz: isCombo,
      janamazColor: cleanJanamazColor,
      freeShipping: !!catalogItem.freeShipping,
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
  
  // Shipping Rule:
  // - Prepaid orders of ₹598+ get FREE SHIPPING!
  // - Orders above ₹999 get FREE SHIPPING on BOTH COD and Online/Prepaid!
  // - Prepaid orders below ₹598 pay standard ₹120 delivery charge.
  // - COD orders below ₹999 pay standard ₹120 delivery charge.
  const isOnlinePayment = (paymentMethod !== 'cod');
  let hasFreeShipping = false;
  let shipping = 120;

  if (subtotal >= 999 || (isOnlinePayment && subtotal >= 598)) {
    hasFreeShipping = true;
    shipping = 0;
  } else {
    hasFreeShipping = false;
    shipping = 120;
  }

  let discount = 0;
  let appliedCoupon = null;

  // Payment Method Discounts:
  // - 10% OFF on prepaid for Combo sets (₹899) or orders >= ₹899
  // - 0% discount on ₹599 kit (Free delivery only, no 5% off)
  let onlineDiscount = 0;
  let codCharge = 0;

  if (isOnlinePayment) {
    const hasCombo = items.some(i => i.hasJanamaz);
    const isComboOr899 = (hasCombo || subtotal >= 899);
    const prepaidDiscountRate = isComboOr899 ? 0.10 : 0;
    onlineDiscount = Math.round(subtotal * prepaidDiscountRate);
  }

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

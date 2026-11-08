const { buildTrustedOrderItems } = require('../backend/services/catalogService');

async function runTests() {
  console.log('Testing buildTrustedOrderItems for Online vs COD...');

  // Test 1: Single item ₹599 online -> should have shipping 0
  const r1 = await buildTrustedOrderItems([{ sku: 'fati_002', qty: 1 }], '400001', null, 'razorpay');
  console.log('Online 1x fati_002 (Rs. 599): shipping =', r1.pricing.shipping, 'total =', r1.pricing.total);
  if (r1.pricing.shipping !== 0) console.error('FAILED: Online shipping should be 0!');
  else console.log('PASSED: Online shipping is 0');

  // Test 2: Low amount ₹199 online -> should also have shipping 0
  const r2 = await buildTrustedOrderItems([{ sku: 'fati_stk_01', qty: 1 }], '400001', null, 'razorpay');
  console.log('Online 1x fati_stk_01 (Rs. 199): shipping =', r2.pricing.shipping, 'total =', r2.pricing.total);
  if (r2.pricing.shipping !== 0) console.error('FAILED: Online ₹199 shipping should be 0!');
  else console.log('PASSED: Online ₹199 shipping is 0');

  // Test 3: Low amount ₹199 COD -> should have shipping 100
  const r3 = await buildTrustedOrderItems([{ sku: 'fati_stk_01', qty: 1 }], '400001', null, 'cod');
  console.log('COD 1x fati_stk_01 (Rs. 199): shipping =', r3.pricing.shipping, 'total =', r3.pricing.total);
  if (r3.pricing.shipping !== 100) console.error('FAILED: COD ₹199 shipping should be 100!');
  else console.log('PASSED: COD ₹199 shipping is 100');

  // Test 4: ₹999 COD -> should have shipping 0
  const r4 = await buildTrustedOrderItems([{ sku: 'fati_ess_combo', qty: 1 }], '400001', null, 'cod');
  console.log('COD 1x fati_ess_combo (Rs. 999): shipping =', r4.pricing.shipping, 'total =', r4.pricing.total);
  if (r4.pricing.shipping !== 0) console.error('FAILED: COD ₹999 shipping should be 0!');
  else console.log('PASSED: COD ₹999 shipping is 0');
}

runTests();

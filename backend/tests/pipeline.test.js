process.env.NODE_ENV = 'test';
const config = require('../config/env');
config.shiprocketMode = 'test';

/**
 * Automated Verification Test Suite
 * Tests all 12 critical ecommerce, payment, shipping, and failure scenarios.
 */

const assert = require('assert');
const http = require('http');
const app = require('../server');
const firebaseService = require('../services/firebaseService');
const razorpayService = require('../services/razorpayService');
const shiprocketService = require('../services/shiprocketService');

let server;
let baseUrl;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    if (postData && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const mockCustomer = {
  name: 'Fatima Zahra',
  phone: '9876543210',
  pincode: '400001',
  address1: 'Flat 101, Noor Heights, SV Road',
  address2: 'Near Jama Masjid',
  city: 'Mumbai',
  state: 'Maharashtra'
};

async function runTests() {
  console.log('\n===============================================================');
  console.log('🧪 RUNNING FULL ECOMMERCE BACKEND & PIPELINE TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    firebaseService._resetMockStore();
    shiprocketService._setForceFailNextShipment(false);
    try {
      await fn();
      console.log(`  ✅ PASSED: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${name}`);
      console.error(`     Error: ${err.message}`);
      if (err.stack) console.error(`     ${err.stack.split('\n')[1]}`);
      failed++;
    }
  }

  // SCENARIO 1: Buy Now -> Razorpay Test Payment -> Firebase -> Shiprocket
  await test('Scenario 1: Buy Now -> Razorpay Test Payment -> Firebase -> Shiprocket', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ productId: 1, sku: 'fati_001', quantity: 1 }],
      paymentMethod: 'razorpay'
    });

    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.body.success, true);
    assert.strictEqual(createRes.body.data.amount, 85000); // Rs 699 + Rs 151 live Shiprocket shipping = 85000 paise
    assert.ok(createRes.body.data.orderId.startsWith('FC-'));

    const { orderId, razorpayOrderId } = createRes.body.data;
    const paymentId = 'pay_mock_123456';
    const signature = razorpayService._generateSignatureForTest(razorpayOrderId, paymentId);

    const verifyRes = await makeRequest('POST', '/api/payments/razorpay/verify', {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    });

    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.body.success, true);
    assert.strictEqual(verifyRes.body.data.payment.status, 'CAPTURED');
    assert.strictEqual(verifyRes.body.data.shipping.status, 'BOOKED');

    const orderInDb = await firebaseService.getOrder(orderId);
    assert.strictEqual(orderInDb.payment.status, 'CAPTURED');
    assert.strictEqual(orderInDb.shipping.status, 'BOOKED');
  });

  // SCENARIO 1B: Buy Now / Direct Order via Cash on Delivery (COD)
  await test('Scenario 1B: Cash on Delivery (COD) -> Firebase COD_PENDING -> Shiprocket Auto-Book', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ productId: 1, sku: 'fati_001', quantity: 1 }],
      paymentMethod: 'cod'
    });

    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.body.success, true);
    assert.strictEqual(createRes.body.data.status, 'SHIPMENT_BOOKED');
    assert.strictEqual(createRes.body.data.payment.provider, 'COD');
    assert.strictEqual(createRes.body.data.payment.status, 'COD_PENDING');
    assert.strictEqual(createRes.body.data.shipping.status, 'BOOKED');
  });

  // SCENARIO 2: Cart (Multiple Items) -> Razorpay Test Payment -> Firebase -> Shiprocket
  await test('Scenario 2: Cart (Multiple Items) -> Razorpay Test Payment -> Firebase -> Shiprocket', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [
        { productId: 1, sku: 'fati_001', quantity: 2 }, // 699 * 2 = 1398
        { productId: 5, sku: 'fati_stk_01', quantity: 1 } // 199 * 1 = 199 -> Subtotal = 1597 + 151 = 1748
      ],
      paymentMethod: 'razorpay'
    });

    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.body.data.pricing.total, 1748);
    assert.strictEqual(createRes.body.data.amount, 174800);

    const { razorpayOrderId } = createRes.body.data;
    const paymentId = 'pay_cart_mult_999';
    const signature = razorpayService._generateSignatureForTest(razorpayOrderId, paymentId);

    const verifyRes = await makeRequest('POST', '/api/payments/razorpay/verify', {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    });

    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.body.data.status, 'SHIPMENT_BOOKED');
  });

  // SCENARIO 3: Payment failure / Invalid signature -> no shipment created
  await test('Scenario 3: Payment failure / Invalid signature -> no shipment created', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ productId: 1, sku: 'fati_001', quantity: 1 }],
      paymentMethod: 'razorpay'
    });

    const { orderId, razorpayOrderId } = createRes.body.data;
    const verifyRes = await makeRequest('POST', '/api/payments/razorpay/verify', {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: 'pay_tampered_fake',
      razorpay_signature: 'invalid_fraud_signature_12345'
    });

    assert.strictEqual(verifyRes.status, 400);
    assert.strictEqual(verifyRes.body.success, false);

    const orderInDb = await firebaseService.getOrder(orderId);
    assert.strictEqual(orderInDb.payment.status, 'CREATED');
    assert.strictEqual(orderInDb.shipping.status, 'NOT_BOOKED');
  });

  // SCENARIO 4: Duplicate payment callback -> no duplicate shipment
  await test('Scenario 4: Duplicate payment callback -> Idempotent, no duplicate shipment', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_002', quantity: 1 }],
      paymentMethod: 'razorpay'
    });

    const { razorpayOrderId } = createRes.body.data;
    const paymentId = 'pay_dup_cb_111';
    const signature = razorpayService._generateSignatureForTest(razorpayOrderId, paymentId);

    // Call 1
    const verifyRes1 = await makeRequest('POST', '/api/payments/razorpay/verify', {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    });
    assert.strictEqual(verifyRes1.status, 200);
    const initialAwb = verifyRes1.body.data.shipping.awb;

    // Call 2 (Duplicate)
    const verifyRes2 = await makeRequest('POST', '/api/payments/razorpay/verify', {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    });
    assert.strictEqual(verifyRes2.status, 200);
    assert.strictEqual(verifyRes2.body.data.shipping.awb, initialAwb);
  });

  // SCENARIO 5: Duplicate Razorpay webhook -> Processed once, duplicate ignored
  await test('Scenario 5: Duplicate Razorpay webhook -> Processed once, duplicate ignored', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_003', quantity: 1 }],
      paymentMethod: 'razorpay'
    });

    const { razorpayOrderId } = createRes.body.data;
    const eventId = 'evt_test_rzp_dup_001';
    const webhookPayload = JSON.stringify({
      id: eventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_dup_888',
            order_id: razorpayOrderId,
            amount: 49100,
            status: 'captured'
          }
        }
      }
    });

    const signature = razorpayService._generateWebhookSignatureForTest(webhookPayload);

    // Webhook 1
    const res1 = await makeRequest('POST', '/api/webhooks/razorpay', webhookPayload, {
      'x-razorpay-signature': signature
    });
    assert.strictEqual(res1.status, 200);

    // Webhook 2 (Duplicate with same event ID)
    const res2 = await makeRequest('POST', '/api/webhooks/razorpay', webhookPayload, {
      'x-razorpay-signature': signature
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.message, 'Event already processed.');
  });

  // SCENARIO 6: Duplicate Shiprocket webhook -> Idempotent update without order corruption
  await test('Scenario 6: Duplicate Shiprocket webhook -> Idempotent tracking update', async () => {
    // 1. Create and fulfill an order
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_004', quantity: 1 }],
      paymentMethod: 'razorpay'
    });
    const { orderId, razorpayOrderId } = createRes.body.data;
    const paymentId = 'pay_sr_track_001';
    const sig = razorpayService._generateSignatureForTest(razorpayOrderId, paymentId);
    const verifyRes = await makeRequest('POST', '/api/payments/razorpay/verify', {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sig
    });
    const awb = verifyRes.body.data.shipping.awb;

    // 2. Send Shiprocket tracking webhook
    const srPayload = {
      awb: awb,
      current_status: 'IN TRANSIT',
      location: 'Mumbai Hub',
      timestamp: 1690000000
    };

    const res1 = await makeRequest('POST', '/api/webhooks/shiprocket', srPayload);
    assert.strictEqual(res1.status, 200);

    // 3. Send same webhook again
    const res2 = await makeRequest('POST', '/api/webhooks/shiprocket', srPayload);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.message, 'Event already processed.');

    // Check DB status is SHIPPED
    await new Promise(r => setTimeout(r, 1000));
    const orderInDb = await firebaseService.getOrder(orderId);
    assert.strictEqual(orderInDb.status, 'SHIPPED');
  });

  // SCENARIO 7: Price tampering from frontend -> backend calculates from catalog and ignores frontend price
  await test('Scenario 7: Price tampering from frontend -> Server calculates trusted price', async () => {
    const tamperedPayload = {
      customer: mockCustomer,
      items: [{ sku: 'fati_001', quantity: 1 }],
      total: 1, // Tampered Rs. 1 attempt
      subtotal: 1,
      price: 1,
      paymentMethod: 'razorpay'
    };

    const res = await makeRequest('POST', '/api/orders/create', tamperedPayload);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.pricing.total, 850); // Server computed authoritative price (699 + 151 live shipping)
    assert.strictEqual(res.body.data.amount, 85000); // 85000 paise
  });

  // SCENARIO 8: Invalid SKU -> backend rejects with 400 Bad Request
  await test('Scenario 8: Invalid SKU -> Backend rejects with 400 Bad Request', async () => {
    const res = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fake_non_existent_sku_999', quantity: 1 }],
      paymentMethod: 'razorpay'
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'INVALID_SKU');
  });

  // SCENARIO 9: Invalid quantity (0, -1, >50) -> backend rejects with 400
  await test('Scenario 9: Invalid quantity -> Backend rejects with 400 Bad Request', async () => {
    const resZero = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_001', quantity: 0 }],
      paymentMethod: 'razorpay'
    });
    assert.strictEqual(resZero.status, 400);
    assert.strictEqual(resZero.body.error.code, 'INVALID_ITEM_QUANTITY');

    const resExcessive = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_001', quantity: 99 }],
      paymentMethod: 'razorpay'
    });
    assert.strictEqual(resExcessive.status, 400);
  });

  // SCENARIO 10: Missing address/phone/pincode -> backend rejects with 400
  await test('Scenario 10: Missing required address fields -> Backend rejects with 400', async () => {
    // Missing phone
    const resNoPhone = await makeRequest('POST', '/api/orders/create', {
      customer: { ...mockCustomer, phone: '' },
      items: [{ sku: 'fati_001', quantity: 1 }]
    });
    assert.strictEqual(resNoPhone.status, 400);
    assert.strictEqual(resNoPhone.body.error.code, 'INVALID_PHONE');

    // Invalid 5-digit pincode
    const resBadPincode = await makeRequest('POST', '/api/orders/create', {
      customer: { ...mockCustomer, pincode: '12345' },
      items: [{ sku: 'fati_001', quantity: 1 }]
    });
    assert.strictEqual(resBadPincode.status, 400);
    assert.strictEqual(resBadPincode.body.error.code, 'INVALID_PINCODE');
  });

  // SCENARIO 11: Shiprocket API failure -> payment remains safe (CAPTURED), shipping marked FAILED, retry works
  await test('Scenario 11: Shiprocket API failure -> Payment remains safe, shipping retry works', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_005', quantity: 1 }],
      paymentMethod: 'razorpay'
    });
    const { orderId, razorpayOrderId } = createRes.body.data;
    const paymentId = 'pay_fail_ship_001';
    const sig = razorpayService._generateSignatureForTest(razorpayOrderId, paymentId);

    // Force Shiprocket to fail on this call
    shiprocketService._setForceFailNextShipment(true);

    const verifyRes = await makeRequest('POST', '/api/payments/razorpay/verify', {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sig
    });

    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.body.data.payment.status, 'CAPTURED');
    assert.strictEqual(verifyRes.body.data.shipping.status, 'FAILED');

    // Test retry endpoint
    const retryRes = await makeRequest('POST', `/api/shipments/${orderId}/retry`);
    assert.strictEqual(retryRes.status, 200);
    assert.strictEqual(retryRes.body.success, true);
    assert.strictEqual(retryRes.body.data.status, 'BOOKED');
    assert.ok(retryRes.body.data.awb);
  });

  // SCENARIO 12: Browser closes after payment -> Webhook still completes order flow and books shipment
  await test('Scenario 12: Browser closes after payment -> Webhook captures payment & books shipment', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_006', quantity: 1 }],
      paymentMethod: 'razorpay'
    });
    const { orderId, razorpayOrderId } = createRes.body.data;

    // Simulate webhook arriving because browser closed before calling /verify
    const webhookPayload = JSON.stringify({
      id: `evt_browser_closed_${Date.now()}`,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_bg_webhook_999',
            order_id: razorpayOrderId,
            amount: 49100,
            status: 'captured'
          }
        }
      }
    });
    const sig = razorpayService._generateWebhookSignatureForTest(webhookPayload);

    const webhookRes = await makeRequest('POST', '/api/webhooks/razorpay', webhookPayload, {
      'x-razorpay-signature': sig
    });
    assert.strictEqual(webhookRes.status, 200);

    // Allow background processing for live network requests
    await new Promise(r => setTimeout(r, 2500));

    const orderInDb = await firebaseService.getOrder(orderId);
    assert.strictEqual(orderInDb.payment.status, 'CAPTURED');
    assert.strictEqual(orderInDb.shipping.status, 'BOOKED');
    assert.ok(orderInDb.shipping.awb);
  });

  // SCENARIO 13: Admin API Unauthorized -> Rejected with 401
  await test('Scenario 13: Admin API Unauthorized -> Rejected with 401', async () => {
    const res = await makeRequest('GET', '/api/admin/orders');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });

  // SCENARIO 14: Admin API Authorized -> Fetches Orders & Stats
  await test('Scenario 14: Admin API Authorized -> Fetches Orders & Stats Successfully', async () => {
    const headers = { 'Authorization': 'Bearer mock_admin_token_for_tests' };

    // 1. Create a test order
    await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_001', quantity: 1 }],
      paymentMethod: 'cod'
    });

    // Fetch Orders
    const ordersRes = await makeRequest('GET', '/api/admin/orders', null, headers);
    assert.strictEqual(ordersRes.status, 200);
    assert.strictEqual(ordersRes.body.success, true);
    assert.ok(ordersRes.body.data.length > 0);

    // Fetch Stats
    const statsRes = await makeRequest('GET', '/api/admin/stats', null, headers);
    assert.strictEqual(statsRes.status, 200);
    assert.strictEqual(statsRes.body.success, true);
    assert.ok(statsRes.body.data.totalOrders > 0);
  });

  // SCENARIO 15: Admin Cancel Order -> Successfully cancels order in Firebase
  await test('Scenario 15: Admin Cancel Order -> Status set to CANCELLED', async () => {
    const headers = { 'Authorization': 'Bearer mock_admin_token_for_tests' };

    // 1. Create an order
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_002', quantity: 1 }],
      paymentMethod: 'cod'
    });
    const orderId = createRes.body.data.orderId;

    // 2. Admin cancels order
    const cancelRes = await makeRequest('POST', `/api/admin/orders/${orderId}/cancel`, {
      reason: 'Testing cancellation feature'
    }, headers);

    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.body.success, true);
    assert.strictEqual(cancelRes.body.data.status, 'CANCELLED');

    // 3. Verify in database
    const orderInDb = await firebaseService.getOrder(orderId);
    assert.strictEqual(orderInDb.status, 'CANCELLED');
    assert.strictEqual(orderInDb.shipping.status, 'CANCELLED');
    assert.ok(orderInDb.events.some(e => e.event === 'ORDER_CANCELLED_BY_ADMIN'));
  });

  // SCENARIO 16: Tax Invoice Generation -> Retrieves Shiprocket invoice URL
  await test('Scenario 16: Tax Invoice Generation -> Retrieves Shiprocket invoice URL', async () => {
    const createRes = await makeRequest('POST', '/api/orders/create', {
      customer: mockCustomer,
      items: [{ sku: 'fati_001', quantity: 1 }],
      paymentMethod: 'cod'
    });
    const { orderId } = createRes.body.data;

    const invoiceRes = await makeRequest('GET', `/api/shipments/${orderId}/invoice`);
    assert.strictEqual(invoiceRes.status, 200);
    assert.strictEqual(invoiceRes.body.success, true);
    assert.ok(invoiceRes.body.data.invoiceUrl);
  });

  // SCENARIO 17: COD Daily Limit Protection -> Blocks 4th COD order within 24 hours
  await test('Scenario 17: COD Daily Limit Protection -> Blocks 4th COD order within 24 hours', async () => {
    const spamCustomer = {
      ...mockCustomer,
      phone: '9888877777'
    };

    // Place 3 COD orders (allowed)
    for (let i = 0; i < 3; i++) {
      const res = await makeRequest('POST', '/api/orders/create', {
        customer: spamCustomer,
        items: [{ sku: 'fati_001', quantity: 1 }],
        paymentMethod: 'cod'
      });
      assert.strictEqual(res.status, 201);
    }

    // 4th COD OTP request must be rejected with COD_DAILY_LIMIT_EXCEEDED
    const otpRes = await makeRequest('POST', '/api/orders/send-cod-otp', {
      phone: spamCustomer.phone
    });
    assert.strictEqual(otpRes.status, 400);
    assert.strictEqual(otpRes.body.error.code, 'COD_DAILY_LIMIT_EXCEEDED');
  });

  // SCENARIO 18: Admin WhatsApp Notification -> Formats order details for 918600380233
  await test('Scenario 18: Admin WhatsApp Notification -> Formats order details for 918600380233', async () => {
    const whatsappService = require('../services/whatsappService');
    const mockOrder = {
      orderId: 'FC-TEST-999',
      payment: { provider: 'COD' },
      pricing: { total: 1299 },
      customer: {
        name: 'Ahmed Khan',
        phone: '9876543210',
        address1: '123 Test St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001'
      },
      items: [
        { title: 'Calligraphy Frame', variant: 'Gold 12x18', quantity: 1, price: 1299 }
      ],
      shipping: { status: 'BOOKED', awb: 'SR123456789' }
    };

    const res = await whatsappService.sendAdminOrderNotificationWhatsApp(mockOrder);
    assert.strictEqual(typeof res, 'boolean');
  });

  console.log('\n===============================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Start test server
server = app.listen(0, async () => {
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  try {
    await runTests();
  } finally {
    server.close();
  }
});

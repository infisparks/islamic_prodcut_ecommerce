# 🕋 Fatima Calligrapher — Production-Grade Ecommerce Architecture

A secure, enterprise-grade full-stack ecommerce backend built with **Node.js, Express, Firebase Realtime Database (Admin SDK), Razorpay, and Shiprocket**. It connects seamlessly to the existing high-converting "Fatima Calligrapher" single-page storefront without altering any visual design, typography, color palettes, product images, or responsive behavior.

---

## 🌟 Key Architectural Features

- **Zero-Trust Pricing Architecture**: The server never trusts client-supplied prices, totals, discounts, or weights. All computations are authoritatively derived from the server's immutable product catalog (`backend/config/catalog.js`).
- **Timing-Safe Cryptographic Verification**: Razorpay payment signatures are validated using Node.js `crypto.timingSafeEqual` with HMAC-SHA256 digests (`razorpay_order_id + "|" + razorpay_payment_id`).
- **Raw-Body Webhook Ingestion**: Webhook signatures are verified against pristine `req.rawBody` Buffers to eliminate payload mutation issues.
- **Strict Idempotency & Mutex Locks**: In-memory and state-based locks (`withLock`) prevent double-spend, duplicate Shiprocket bookings, and race conditions from simultaneous callbacks or retried webhooks.
- **Shiprocket JWT Manager**: Automatic token authentication with in-memory caching and proactive refresh before expiry.
- **Resilient Shipping Isolation**: If the Shiprocket API experiences temporary outages, customer payments remain securely stored as `CAPTURED` with a dedicated retry endpoint (`POST /api/shipments/:orderId/retry`).
- **Unified Order Pipeline**: Both **Direct Buy Now** and **Cart Multi-Item Checkout** feed into the exact same backend validation, payment, and shipping pipelines.
- **Zero Secret Exposure**: No API keys, JWTs, Firebase private keys, or passwords ever leave the backend or appear in client-facing code or logs.

---

## 📂 Project Structure

```
mantasha/
├── index.html                      # Storefront (Untouched UI, wired to backend API)
├── package.json                    # Dependencies & test scripts
├── .env.example                    # Environment variable template
├── .env                            # Active environment configuration
├── database.rules.json             # Strict Firebase Realtime DB security rules
├── README.md                       # Complete deployment & operations guide
├── product/                        # Product images & webp assets
└── backend/
    ├── server.js                   # Express server, Helmet, CORS, body parsers, routes
    ├── config/
    │   ├── env.js                  # Environment variable loader
    │   └── catalog.js              # Authoritative server product catalog (15 SKUs)
    ├── middleware/
    │   ├── validation.js           # Strict input sanitization & validation (phone, pincode, address)
    │   ├── rateLimit.js            # API & order creation rate limiters
    │   └── errorHandler.js         # Safe error handler (scrubs internal traces)
    ├── routes/
    │   ├── orders.js               # POST /api/orders/create, GET /api/orders/:orderId
    │   ├── payments.js             # POST /api/payments/razorpay/verify
    │   ├── shipments.js            # POST /api/shipments/create, POST /api/shipments/:orderId/retry
    │   └── webhooks.js             # POST /api/webhooks/razorpay, POST /api/webhooks/shiprocket
    ├── services/
    │   ├── firebaseService.js      # Firebase Admin Realtime DB service & test mock store
    │   ├── razorpayService.js      # Razorpay order creator & HMAC signature verifier
    │   ├── shiprocketService.js    # Shiprocket JWT cache, order creation & AWB assignment
    │   └── catalogService.js       # Trusted price, weight, dimensions, HSN calculations
    ├── utils/
    │   ├── crypto.js               # Timing-safe HMAC verifier & order ID generator
    │   ├── logger.js               # Structured logger with secret/credential redaction
    │   └── idempotency.js          # Concurrency lock mechanism
    └── tests/
        └── pipeline.test.js        # Automated test suite for all 13 core scenarios
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (`.env`)

Copy the `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:

```ini
# Server Environment
PORT=3000
NODE_ENV=development
PAYMENT_MODE=test
SHIPROCKET_MODE=test
CORS_ORIGIN=http://localhost:3000

# Firebase Admin SDK
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Shiprocket API
SHIPROCKET_EMAIL=your_shiprocket_email@example.com
SHIPROCKET_PASSWORD=your_shiprocket_password
SHIPROCKET_WEBHOOK_SECRET=your_shiprocket_webhook_secret

# Razorpay API
RAZORPAY_KEY_ID=rzp_test_yourKeyId
RAZORPAY_KEY_SECRET=yourRazorpayKeySecret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

### 3. Run Verification Tests

Run the automated test suite verifying all 13 success & failure scenarios:

```bash
npm test
```

### 4. Start the Application

#### Option A: Using Node / PM2
```bash
# Development mode with live reload
npm run dev

# Or standard production start
npm start
```

#### Option B: Using Docker & Docker Compose
```bash
# Build and run container in background
docker compose up -d --build

# View container logs
docker compose logs -f

# Stop container
docker compose down
```

Visit the storefront at: `http://localhost:3000`
Visit the admin dashboard at: `http://localhost:3000/admin`

---

## 🛡️ Admin Dashboard & Firebase Authentication

The Admin Portal (`/admin`) is built following a clean HR-dashboard minimal design system (purple/indigo primary accents, `#F5F6F8` background, clean data tables, live search/filtering, and 1-click order cancellation).

### How to Create an Admin Account in Firebase Auth:
1. Go to your [Firebase Console](https://console.firebase.google.com/) → Select your project **`mantasha-9b267`**.
2. Click **Authentication** (left sidebar) → **Users** tab.
3. If not already enabled, enable **Email/Password** under the **Sign-in method** tab.
4. Click **Add user** → Enter your admin email (e.g. `admin@fatimacalligrapher.com`) and a secure password.
5. Visit `http://localhost:3000/admin` and log in with those credentials!

### Admin Features:
- **Real-Time KPIs**: Total Orders, Total Revenue, Paid (Razorpay), Cash on Delivery, and Cancelled Orders.
- **Search & Live Filters**: Search by Order ID, Customer Name, Phone, AWB, or filter by status.
- **1-Click Cancel Order**: Instantly cancel any order (ideal for test orders or customer requests). It updates Firebase status to `CANCELLED` and marks shipping as cancelled.
- **Full Order Detail View**: Customer shipping address, SKU breakdown, payment details, live Shiprocket AWB tracking link, and event activity history.
- **Retry Failed Shipping**: 1-click retry for any order whose courier booking was delayed.

## 🔒 Webhook Secret Setup Instructions

### 📌 Where to Paste `RAZORPAY_WEBHOOK_SECRET`:
1. Log into your [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Navigate to **Account & Settings** → **Webhooks** (under Developer Controls).
3. Click **Add New Webhook**.
4. Enter your Webhook URL: `https://yourdomain.com/api/webhooks/razorpay`
5. Under **Secret**, generate or type a random high-entropy secret string (e.g. `fc_rzp_sec_99a8b7c6d5e4`).
6. Select the events:
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
7. Copy this secret string and paste it into your `.env` file as:
   ```ini
   RAZORPAY_WEBHOOK_SECRET=fc_rzp_sec_99a8b7c6d5e4
   ```
8. Restart your server.

---

### 📌 Where to Paste `SHIPROCKET_WEBHOOK_SECRET`:
1. Log into your [Shiprocket Dashboard](https://app.shiprocket.in/).
2. Navigate to **Settings** → **API** → **Webhooks**.
3. Add a new tracking webhook pointing to: `https://yourdomain.com/api/webhooks/shiprocket`
4. Set the Security Token / API Key Header (e.g. `fc_sr_sec_11223344`).
5. Paste that token into your `.env` file as:
   ```ini
   SHIPROCKET_WEBHOOK_SECRET=fc_sr_sec_11223344
   ```
6. Restart your server.

---

## 🛡️ Firebase Security Rules Setup

Copy the contents of `database.rules.json` into your **Firebase Console** → **Realtime Database** → **Rules** tab and click **Publish**:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "orders": {
      "$orderId": {
        ".read": false,
        ".write": false
      }
    },
    "webhookEvents": {
      ".read": false,
      ".write": false
    },
    "idempotencyLocks": {
      ".read": false,
      ".write": false
    }
  }
}
```

*Note: Since the backend uses the Firebase Admin SDK (`firebase-admin`), all server operations bypass security rules securely while all unauthorized client-side access is completely blocked.*

---

## 📊 Firebase Realtime Database Data Schema

Orders are stored under `/orders/{internalOrderId}`:

```json
{
  "orderId": "FC-20260809-A1B2C3D4",
  "createdAt": "2026-08-09T10:45:00.000Z",
  "updatedAt": "2026-08-09T10:45:15.000Z",
  "status": "SHIPMENT_BOOKED",
  "customer": {
    "name": "Fatima Zahra",
    "phone": "9876543210",
    "pincode": "400001",
    "address1": "Flat 101, Noor Heights",
    "address2": "SV Road",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India"
  },
  "items": [
    {
      "productId": 1,
      "sku": "fati_001",
      "name": "Umrah Dua & Guide Cards (Urdu / اردو)",
      "variantName": "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
      "quantity": 1,
      "unitPrice": 699,
      "totalPrice": 699,
      "weightKg": 0.15,
      "weightLabel": "150gm",
      "hsn": "4910"
    }
  ],
  "pricing": {
    "subtotal": 699,
    "shipping": 0,
    "total": 699,
    "currency": "INR"
  },
  "package": {
    "weightKg": 0.15,
    "dimensions": { "length": 15, "breadth": 10, "height": 2.5 }
  },
  "inventoryStatus": "IN_STOCK",
  "payment": {
    "provider": "razorpay",
    "status": "CAPTURED",
    "amountPaise": 69900,
    "currency": "INR",
    "razorpayOrderId": "order_XXXXXXXXXXXX",
    "razorpayPaymentId": "pay_YYYYYYYYYYYY",
    "paidAt": "2026-08-09T10:45:10.000Z"
  },
  "shipping": {
    "provider": "shiprocket",
    "status": "BOOKED",
    "shiprocketOrderId": "SR_12345678",
    "shipmentId": "SH_9876543",
    "awb": "142387654921",
    "courierName": "Delhivery Express Surface",
    "trackingUrl": "https://shiprocket.co/tracking/142387654921",
    "bookedAt": "2026-08-09T10:45:15.000Z",
    "lastTrackingUpdate": null
  },
  "events": [
    {
      "event": "ORDER_INITIATED",
      "timestamp": "2026-08-09T10:45:00.000Z",
      "details": "Order created via RAZORPAY"
    },
    {
      "event": "PAYMENT_CAPTURED",
      "timestamp": "2026-08-09T10:45:10.000Z",
      "details": "Razorpay payment pay_YYYYYYYYYYYY verified and captured"
    },
    {
      "event": "SHIPMENT_BOOKED",
      "timestamp": "2026-08-09T10:45:15.000Z",
      "details": "Shiprocket order booked with AWB 142387654921"
    }
  ]
}
```

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/orders/create` | Validates customer & cart, calculates trusted total, creates Razorpay/COD order in Firebase |
| `POST` | `/api/payments/razorpay/verify` | Timing-safe Razorpay signature verification; triggers Shiprocket booking upon payment capture |
| `POST` | `/api/webhooks/razorpay` | Ingests Razorpay webhook events (`payment.captured`, `payment.failed`, `order.paid`) with idempotency |
| `POST` | `/api/shipments/create` | Manually/internally books shipment for a paid or COD order |
| `POST` | `/api/shipments/:orderId/retry` | Retries Shiprocket booking if initial courier API call timed out or failed |
| `POST` | `/api/webhooks/shiprocket` | Ingests live tracking status updates from Shiprocket and syncs Firebase order status |
| `GET` | `/api/orders/:orderId` | Retrieves full order details |
| `GET` | `/api/orders/:orderId/status` | Returns a lightweight status summary (`status`, `paymentStatus`, `shippingStatus`, `awb`, `courierName`) |
| `GET` | `/health` | Server health check endpoint |

---

## 🔄 Switching from Test to Live Production Mode

When you are ready to accept real payments and generate live Shiprocket shipping labels:

1. In `.env`:
   - Set `NODE_ENV=production`
   - Set `PAYMENT_MODE=live`
   - Set `SHIPROCKET_MODE=live`
   - Set `CORS_ORIGIN=https://yourdomain.com`
2. Update **Razorpay Credentials**:
   - Change `RAZORPAY_KEY_ID` to your live key (starts with `rzp_live_...`).
   - Change `RAZORPAY_KEY_SECRET` to your live secret.
   - Update `RAZORPAY_WEBHOOK_SECRET` from live dashboard.
3. Update **Shiprocket Credentials**:
   - Provide your live Shiprocket account `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD`.
   - Update `SHIPROCKET_WEBHOOK_SECRET`.
4. Update **Firebase Admin Credentials**:
   - Provide your production Firebase project Service Account JSON credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL`).
5. Restart your Node.js application server. No frontend code changes are needed!

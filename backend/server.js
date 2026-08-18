const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/env');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');

const ordersRouter = require('./routes/orders');
const paymentsRouter = require('./routes/payments');
const shipmentsRouter = require('./routes/shipments');
const webhooksRouter = require('./routes/webhooks');
const adminRouter = require('./routes/admin');
const metaRouter = require('./routes/meta');

const app = express();

// 1. Security Headers with Helmet (Configured for inline onclick handlers, Razorpay SDK, Meta Pixel/CAPI, Firebase & Tailwind)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.tailwindcss.com",
          "https://checkout.razorpay.com",
          "https://cdn.razorpay.com",
          "https://*.razorpay.com",
          "https://cdnjs.cloudflare.com",
          "https://www.gstatic.com",
          "https://*.gstatic.com",
          "https://*.googleapis.com",
          "https://static.cloudflareinsights.com",
          "https://*.cloudflareinsights.com",
          "https://connect.facebook.net",
          "https://*.facebook.net"
        ],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://checkout.razorpay.com",
          "https://cdn.razorpay.com",
          "https://*.razorpay.com",
          "https://cdnjs.cloudflare.com",
          "https://www.gstatic.com",
          "https://*.gstatic.com",
          "https://*.googleapis.com",
          "https://static.cloudflareinsights.com",
          "https://*.cloudflareinsights.com",
          "https://connect.facebook.net",
          "https://*.facebook.net"
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        frameSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com",
          "https://*.razorpay.com",
          "https://*.firebaseapp.com",
          "https://*.hcaptcha.com",
          "https://www.facebook.com"
        ],
        connectSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com",
          "https://*.razorpay.com",
          "https://lumberjack.razorpay.com",
          "https://apiv2.shiprocket.in",
          "https://*.shiprocket.in",
          "https://*.firebaseio.com",
          "https://*.googleapis.com",
          "https://*.gstatic.com",
          "https://www.gstatic.com",
          "https://*.firebaseapp.com",
          "https://*.stripe.network",
          "https://*.hcaptcha.com",
          "https://static.cloudflareinsights.com",
          "https://*.cloudflareinsights.com",
          "https://www.facebook.com",
          "https://*.facebook.com",
          "https://graph.facebook.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https:",
          "http:"
        ],
        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "https:",
          "http:"
        ],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com"
        ],
        imgSrc: ["'self'", "data:", "blob:", "https:", "https://www.facebook.com"],
        mediaSrc: ["'self'", "https:", "https://commondatastorage.googleapis.com"]
      }
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false
  })
);

// 2. CORS configuration
app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin,
  credentials: true
}));

// 3. Body parsers with raw body buffer preservation for webhook signature checks
app.use(express.json({
  limit: '50kb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '50kb'
}));

// 4. Rate limiting for API endpoints
app.use('/api/', apiLimiter);

// 5. Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Fatima Calligrapher Ecommerce Backend',
    mode: config.paymentMode,
    timestamp: new Date().toISOString()
  });
});

// 6. API Route Handlers
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/admin', adminRouter);
app.use('/api/meta', metaRouter);

// 7. Serve existing frontend static files & media directories
const rootDir = path.resolve(__dirname, '..');
app.use('/product', express.static(path.join(rootDir, 'product')));
app.use(express.static(rootDir));

app.get('/recent-purchases.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(rootDir, 'recent-purchases.js'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/product.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'product.html'));
});

app.get('/product', (req, res, next) => {
  if (req.accepts('html') || req.query.id || req.query.product) {
    return res.sendFile(path.join(rootDir, 'product.html'));
  }
  next();
});

app.get('/checkout.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'checkout.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(rootDir, 'checkout.html'));
});

app.get(['/admin.html', '/admin'], (req, res) => {
  res.sendFile(path.join(rootDir, 'admin.html'));
});

// 8. 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested API endpoint does not exist.'
    }
  });
});

// 9. Central Error Handler
app.use(errorHandler);

// Start server if run directly
if (require.main === module) {
  const PORT = config.port;
  app.listen(PORT, () => {
    logger.info('SERVER_STARTED', {
      port: PORT,
      nodeEnv: config.nodeEnv,
      paymentMode: config.paymentMode,
      shiprocketMode: config.shiprocketMode
    });
    console.log(`\n======================================================`);
    console.log(`🚀 FATIMA CALLIGRAPHER SECURE BACKEND RUNNING`);
    console.log(`🌐 Storefront URL: http://localhost:${PORT}`);
    console.log(`🔒 Environment: ${config.nodeEnv} | Mode: ${config.paymentMode.toUpperCase()}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;

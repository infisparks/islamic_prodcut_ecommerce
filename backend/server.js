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

const app = express();

// 1. Security Headers with Helmet (Allowing necessary CDNs for Razorpay, Fonts & Videos)
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
          "https://cdnjs.cloudflare.com"
        ],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://checkout.razorpay.com",
          "https://cdnjs.cloudflare.com"
        ],
        frameSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com"
        ],
        connectSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com",
          "https://lumberjack.razorpay.com",
          "https://apiv2.shiprocket.in"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com"
        ],
        imgSrc: ["'self'", "data:", "https:"],
        mediaSrc: ["'self'", "https:", "https://commondatastorage.googleapis.com"]
      }
    },
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

// 7. Serve existing frontend static files
const rootDir = path.resolve(__dirname, '..');
app.use(express.static(rootDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/admin', (req, res) => {
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

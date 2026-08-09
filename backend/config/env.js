const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  paymentMode: process.env.PAYMENT_MODE || 'test',
  shiprocketMode: process.env.SHIPROCKET_MODE || 'test',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  firebase: {
    databaseUrl: process.env.FIREBASE_DATABASE_URL || 'https://mantasha-9b267-default-rtdb.firebaseio.com',
    databaseSecret: process.env.FIREBASE_DATABASE_SECRET || '',
    projectId: process.env.FIREBASE_PROJECT_ID || 'mantasha-9b267',
    apiKey: process.env.FIREBASE_API_KEY || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },

  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL || '',
    password: process.env.SHIPROCKET_PASSWORD || '',
    webhookSecret: process.env.SHIPROCKET_WEBHOOK_SECRET || '',
    baseUrl: 'https://apiv2.shiprocket.in/v1/external',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
};

module.exports = config;

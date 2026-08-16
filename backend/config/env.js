const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file across multiple potential locations
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

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
    pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    webhookSecret: process.env.SHIPROCKET_WEBHOOK_SECRET || '',
    baseUrl: 'https://apiv2.shiprocket.in/v1/external',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://evo.infispark.in',
    apiKey: process.env.WHATSAPP_API_KEY || 'vR39h6avY69g7kAU3YQbS6V6XEvudson',
    instance: process.env.WHATSAPP_INSTANCE || 'mantasha',
    notifyNumber: process.env.WHATSAPP_NOTIFY_NUMBER || '918600380233',
  },

  meta: {
    pixelId: process.env.META_PIXEL_ID || '1565922841643245',
    accessToken: process.env.META_ACCESS_TOKEN || '',
    testEventCode: process.env.META_TEST_EVENT_CODE || '',
  },
};

module.exports = config;

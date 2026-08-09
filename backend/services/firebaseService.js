const axios = require('axios');
const admin = require('firebase-admin');
const config = require('../config/env');
const logger = require('../utils/logger');

let db = null;
let useDatabaseSecret = false;
let isMock = false;

const mockStore = {
  orders: {},
  webhookEvents: {
    razorpay: {},
    shiprocket: {}
  }
};

// 1. Check if Firebase Database Secret is configured
if (
  config.firebase.databaseUrl &&
  config.firebase.databaseSecret &&
  !config.firebase.databaseSecret.includes('dummy')
) {
  useDatabaseSecret = true;
  logger.info('FIREBASE_INITIALIZED_DATABASE_SECRET', {
    databaseUrl: config.firebase.databaseUrl,
    projectId: config.firebase.projectId
  });
}
// 2. Check if Firebase Admin SDK Private Key is configured
else if (
  config.firebase.projectId &&
  config.firebase.clientEmail &&
  config.firebase.privateKey &&
  !config.firebase.privateKey.includes('dummy') &&
  config.firebase.databaseUrl &&
  !config.firebase.databaseUrl.includes('dummy')
) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey
      }),
      databaseURL: config.firebase.databaseUrl
    });
    db = admin.database();
    logger.info('FIREBASE_INITIALIZED_REAL_ADMIN_SDK', { databaseUrl: config.firebase.databaseUrl });
  } catch (err) {
    isMock = true;
    logger.warn('FIREBASE_ADMIN_INIT_FALLBACK', { message: err.message });
  }
} else {
  isMock = true;
  logger.info('FIREBASE_INITIALIZED_MOCK', { mode: 'In-Memory / Test Store' });
}

// REST helper for Database Secret
function getDbUrl(path, queryParams = {}) {
  const cleanBase = config.firebase.databaseUrl.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  const url = new URL(`${cleanBase}/${cleanPath}.json`);
  url.searchParams.set('auth', config.firebase.databaseSecret);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

const firebaseService = {
  isMockMode: () => isMock,

  // Save new order
  saveOrder: async (orderId, orderData) => {
    const dataWithTimestamp = {
      ...orderData,
      updatedAt: new Date().toISOString()
    };

    mockStore.orders[orderId] = JSON.parse(JSON.stringify(dataWithTimestamp));

    if (useDatabaseSecret) {
      try {
        await axios.put(getDbUrl(`orders/${orderId}`), dataWithTimestamp, { timeout: 10000 });
        return dataWithTimestamp;
      } catch (err) {
        logger.error('FIREBASE_REST_SAVE_ERROR', { error: err.message });
        return dataWithTimestamp;
      }
    }

    if (db) {
      const ref = db.ref(`orders/${orderId}`);
      await ref.set(dataWithTimestamp);
    }

    return dataWithTimestamp;
  },

  // Get order by internal ID
  getOrder: async (orderId) => {
    if (useDatabaseSecret) {
      try {
        const res = await axios.get(getDbUrl(`orders/${orderId}`), { timeout: 10000 });
        if (res.data) {
          mockStore.orders[orderId] = res.data;
          return res.data;
        }
      } catch (err) {
        // Fallback to cache
      }
    }

    if (mockStore.orders[orderId]) {
      return JSON.parse(JSON.stringify(mockStore.orders[orderId]));
    }

    if (db) {
      const snapshot = await db.ref(`orders/${orderId}`).once('value');
      return snapshot.exists() ? snapshot.val() : null;
    }

    return null;
  },

  // Update specific fields on an order
  updateOrder: async (orderId, updates) => {
    const timestampedUpdates = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Update local cache
    if (mockStore.orders[orderId]) {
      for (const [key, value] of Object.entries(timestampedUpdates)) {
        if (key.includes('/')) {
          const parts = key.split('/');
          let curr = mockStore.orders[orderId];
          for (let i = 0; i < parts.length - 1; i++) {
            if (!curr[parts[i]]) curr[parts[i]] = {};
            curr = curr[parts[i]];
          }
          curr[parts[parts.length - 1]] = value;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          mockStore.orders[orderId][key] = {
            ...(mockStore.orders[orderId][key] || {}),
            ...value
          };
        } else {
          mockStore.orders[orderId][key] = value;
        }
      }
    }

    if (useDatabaseSecret) {
      try {
        const patchData = {};
        for (const [key, value] of Object.entries(timestampedUpdates)) {
          if (key.includes('/')) {
            const parts = key.split('/');
            let curr = patchData;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!curr[parts[i]]) curr[parts[i]] = {};
              curr = curr[parts[i]];
            }
            curr[parts[parts.length - 1]] = value;
          } else {
            patchData[key] = value;
          }
        }

        await axios.patch(getDbUrl(`orders/${orderId}`), patchData, { timeout: 10000 });
        return mockStore.orders[orderId];
      } catch (err) {
        logger.warn('FIREBASE_REST_UPDATE_FALLBACK', { error: err.message });
      }
    }

    if (db) {
      const ref = db.ref(`orders/${orderId}`);
      await ref.update(timestampedUpdates);
      const snap = await ref.once('value');
      return snap.val();
    }

    return mockStore.orders[orderId] ? JSON.parse(JSON.stringify(mockStore.orders[orderId])) : null;
  },

  // Find order by Razorpay Order ID
  findOrderByRazorpayOrderId: async (razorpayOrderId) => {
    if (!razorpayOrderId) return null;

    // Check local memory store first
    for (const order of Object.values(mockStore.orders)) {
      if (order.payment && order.payment.razorpayOrderId === razorpayOrderId) {
        return JSON.parse(JSON.stringify(order));
      }
    }

    if (useDatabaseSecret) {
      try {
        const res = await axios.get(getDbUrl('orders'), { timeout: 10000 });
        if (res.data) {
          for (const order of Object.values(res.data)) {
            if (order && order.payment && order.payment.razorpayOrderId === razorpayOrderId) {
              mockStore.orders[order.orderId] = order;
              return order;
            }
          }
        }
      } catch (err) {
        // Ignore and continue
      }
    }

    if (db) {
      const snapshot = await db.ref('orders')
        .orderByChild('payment/razorpayOrderId')
        .equalTo(razorpayOrderId)
        .once('value');

      if (!snapshot.exists()) return null;
      const val = snapshot.val();
      return val[Object.keys(val)[0]];
    }

    return null;
  },

  // Find order by Shiprocket Order ID or AWB
  findOrderByShipmentIdentifier: async (identifier) => {
    if (!identifier) return null;

    for (const order of Object.values(mockStore.orders)) {
      if (
        (order.shipping && String(order.shipping.shiprocketOrderId) === String(identifier)) ||
        (order.shipping && String(order.shipping.shipmentId) === String(identifier)) ||
        (order.shipping && String(order.shipping.awb) === String(identifier)) ||
        order.orderId === identifier
      ) {
        return JSON.parse(JSON.stringify(order));
      }
    }

    if (useDatabaseSecret) {
      try {
        const res = await axios.get(getDbUrl('orders'), { timeout: 10000 });
        if (res.data) {
          for (const order of Object.values(res.data)) {
            if (
              order &&
              ((order.shipping && String(order.shipping.shiprocketOrderId) === String(identifier)) ||
               (order.shipping && String(order.shipping.shipmentId) === String(identifier)) ||
               (order.shipping && String(order.shipping.awb) === String(identifier)) ||
               order.orderId === identifier)
            ) {
              mockStore.orders[order.orderId] = order;
              return order;
            }
          }
        }
      } catch (err) {
        // Ignore and continue
      }
    }

    if (db) {
      const snapOrder = await db.ref('orders')
        .orderByChild('shipping/shiprocketOrderId')
        .equalTo(identifier)
        .once('value');
      if (snapOrder.exists()) {
        const val = snapOrder.val();
        return val[Object.keys(val)[0]];
      }

      const snapAwb = await db.ref('orders')
        .orderByChild('shipping/awb')
        .equalTo(identifier)
        .once('value');
      if (snapAwb.exists()) {
        const val = snapAwb.val();
        return val[Object.keys(val)[0]];
      }
    }

    return null;
  },

  // Check if webhook event already processed
  isWebhookEventProcessed: async (provider, eventId) => {
    if (!eventId) return false;

    if (mockStore.webhookEvents[provider] && mockStore.webhookEvents[provider][eventId]) {
      return true;
    }

    if (useDatabaseSecret) {
      try {
        const res = await axios.get(getDbUrl(`webhookEvents/${provider}/${eventId}`), { timeout: 8000 });
        if (res.data !== null && res.data !== undefined) return true;
      } catch (err) {
        // Fallback
      }
    }

    if (db) {
      const snapshot = await db.ref(`webhookEvents/${provider}/${eventId}`).once('value');
      return snapshot.exists();
    }

    return false;
  },

  // Mark webhook event as processed
  markWebhookEventProcessed: async (provider, eventId, meta = {}) => {
    if (!eventId) return;

    const data = {
      processedAt: new Date().toISOString(),
      ...meta
    };

    if (!mockStore.webhookEvents[provider]) mockStore.webhookEvents[provider] = {};
    mockStore.webhookEvents[provider][eventId] = data;

    if (useDatabaseSecret) {
      try {
        await axios.put(getDbUrl(`webhookEvents/${provider}/${eventId}`), data, { timeout: 8000 });
      } catch (err) {
        // Fallback
      }
    }

    if (db) {
      await db.ref(`webhookEvents/${provider}/${eventId}`).set(data);
    }
  },

  // Clear mock data (for testing)
  _resetMockStore: () => {
    mockStore.orders = {};
    mockStore.webhookEvents.razorpay = {};
    mockStore.webhookEvents.shiprocket = {};
  },

  _getMockStore: () => mockStore
};

module.exports = firebaseService;

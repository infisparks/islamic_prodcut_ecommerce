const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

let cachedToken = null;
let tokenExpiresAt = 0;
let forceFailNextShipment = false; // For testing failure scenarios

const isConfigured =
  config.shiprocket.email &&
  config.shiprocket.password &&
  !config.shiprocket.email.includes('dummy');

/**
 * Get cached Shiprocket Auth Token or login
 */
async function getAuthToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  if (!isConfigured) {
    cachedToken = `mock_jwt_${Math.random().toString(36).substring(2, 18)}`;
    tokenExpiresAt = now + 10 * 24 * 60 * 60 * 1000;
    logger.info('SHIPROCKET_AUTH_MOCK_SUCCESS');
    return cachedToken;
  }

  try {
    const response = await axios.post(`${config.shiprocket.baseUrl}/auth/login`, {
      email: config.shiprocket.email,
      password: config.shiprocket.password
    }, {
      timeout: 10000
    });

    if (response.data && response.data.token) {
      cachedToken = response.data.token;
      tokenExpiresAt = now + (9 * 24 * 60 * 60 * 1000);
      logger.info('SHIPROCKET_AUTH_SUCCESS');
      return cachedToken;
    } else {
      throw new Error('Invalid response from Shiprocket auth');
    }
  } catch (err) {
    if (config.shiprocketMode === 'test') {
      logger.warn('SHIPROCKET_AUTH_TEST_SIMULATION', { message: err.message });
      cachedToken = `mock_jwt_${Math.random().toString(36).substring(2, 18)}`;
      tokenExpiresAt = now + 10 * 24 * 60 * 60 * 1000;
      return cachedToken;
    }
    logger.error('SHIPROCKET_AUTH_FAILED', { message: err.message });
    throw new Error('Failed to authenticate with shipping provider.');
  }
}

const shiprocketService = {
  // Create Shiprocket Order and Assign Courier/AWB
  createShipment: async (order) => {
    if (forceFailNextShipment) {
      forceFailNextShipment = false;
      const err = new Error('Shiprocket API temporarily unavailable (Simulation).');
      err.code = 'SHIPROCKET_API_ERROR';
      throw err;
    }

    try {
      const token = await getAuthToken();

      const orderDate = new Date(order.createdAt || Date.now())
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);

      const orderItems = order.items.map(item => ({
        name: item.name,
        sku: item.sku,
        units: item.quantity,
        selling_price: item.unitPrice,
        discount: 0,
        tax: 0,
        hsn: parseInt(item.hsn || '4910', 10)
      }));

      const paymentMethod = (order.payment && order.payment.provider === 'COD') ? 'COD' : 'Prepaid';

      const payload = {
        order_id: order.orderId,
        order_date: orderDate,
        pickup_location: 'Primary',
        channel_id: '',
        comment: `Order ${order.orderId}`,
        billing_customer_name: order.customer.name,
        billing_last_name: '',
        billing_address: order.customer.address1,
        billing_address_2: order.customer.address2 || '',
        billing_city: order.customer.city,
        billing_pincode: order.customer.pincode,
        billing_state: order.customer.state,
        billing_country: 'India',
        billing_email: order.customer.email || 'customer@fatimacalligrapher.com',
        billing_phone: order.customer.phone,
        shipping_is_billing: true,
        order_items: orderItems,
        payment_method: paymentMethod,
        shipping_charges: order.pricing.shipping || 0,
        giftwrap_charges: 0,
        transaction_charges: 0,
        total_discount: 0,
        sub_total: order.pricing.subtotal,
        length: order.package ? order.package.dimensions.length : 15,
        breadth: order.package ? order.package.dimensions.breadth : 10,
        height: order.package ? order.package.dimensions.height : 2.5,
        weight: order.package ? order.package.weightKg : 0.15
      };

      if (isConfigured && !token.startsWith('mock_jwt_')) {
        try {
          // 1. Create Adhoc Order
          const createRes = await axios.post(
            `${config.shiprocket.baseUrl}/orders/create/adhoc`,
            payload,
            {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 15000
            }
          );

          const shipData = createRes.data;
          const shiprocketOrderId = shipData.order_id;
          const shipmentId = shipData.shipment_id;

          logger.info('SHIPROCKET_ORDER_CREATED', {
            internalOrderId: order.orderId,
            shiprocketOrderId,
            shipmentId
          });

          // 2. Assign AWB/Courier
          let awb = null;
          let courierName = null;
          let trackingUrl = null;

          try {
            const awbRes = await axios.post(
              `${config.shiprocket.baseUrl}/courier/assign/awb`,
              { shipment_id: shipmentId },
              {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 15000
              }
            );

            if (awbRes.data && awbRes.data.response && awbRes.data.response.data) {
              const awbData = awbRes.data.response.data;
              awb = awbData.awb_code;
              courierName = awbData.courier_name;
              trackingUrl = `https://shiprocket.co/tracking/${awb}`;

              logger.info('SHIPROCKET_AWB_ASSIGNED', {
                internalOrderId: order.orderId,
                awb,
                courierName
              });
            }
          } catch (awbErr) {
            logger.warn('SHIPROCKET_AWB_PENDING_MANUAL', {
              internalOrderId: order.orderId,
              message: awbErr.message
            });
          }

          return {
            provider: 'shiprocket',
            status: awb ? 'AWB_ASSIGNED' : 'BOOKED',
            shiprocketOrderId: String(shiprocketOrderId),
            shipmentId: String(shipmentId),
            awb: awb || 'PENDING_ASSIGNMENT',
            courierName: courierName || 'Express Courier Partner',
            trackingUrl: trackingUrl || `https://shiprocket.co/tracking/${shiprocketOrderId}`,
            bookedAt: new Date().toISOString()
          };
        } catch (apiErr) {
          if (config.shiprocketMode === 'test') {
            logger.warn('SHIPROCKET_ORDER_TEST_SIMULATION', { error: apiErr.message });
          } else {
            throw apiErr;
          }
        }
      }

      // Mock / Test Mode Response
      const mockShiprocketOrderId = `SR_${Math.floor(10000000 + Math.random() * 90000000)}`;
      const mockShipmentId = `SH_${Math.floor(1000000 + Math.random() * 9000000)}`;
      const mockAwb = `AWB${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const mockCourier = 'Shiprocket Express (BlueDart / Delhivery)';

      logger.info('SHIPROCKET_ORDER_CREATED_SIMULATED', {
        internalOrderId: order.orderId,
        shiprocketOrderId: mockShiprocketOrderId,
        shipmentId: mockShipmentId,
        awb: mockAwb
      });

      return {
        provider: 'shiprocket',
        status: 'BOOKED',
        shiprocketOrderId: mockShiprocketOrderId,
        shipmentId: mockShipmentId,
        awb: mockAwb,
        courierName: mockCourier,
        trackingUrl: `https://shiprocket.co/tracking/${mockAwb}`,
        bookedAt: new Date().toISOString()
      };
    } catch (err) {
      logger.error('SHIPMENT_FAILED', {
        internalOrderId: order.orderId,
        error: err.message
      });
      throw err;
    }
  },

  _setForceFailNextShipment: (val) => {
    forceFailNextShipment = val;
  }
};

module.exports = shiprocketService;

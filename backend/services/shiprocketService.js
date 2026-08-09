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
    const errorMsg = err.response?.data?.message || err.message || 'Shiprocket authentication failed';
    logger.error('SHIPROCKET_AUTH_FAILED', { message: errorMsg, status: err.response?.status });

    if (config.shiprocketMode === 'test' || process.env.NODE_ENV === 'test') {
      logger.warn('SHIPROCKET_AUTH_TEST_MODE_FALLBACK', { message: errorMsg });
      cachedToken = `mock_jwt_${Math.random().toString(36).substring(2, 18)}`;
      tokenExpiresAt = now + 10 * 24 * 60 * 60 * 1000;
      return cachedToken;
    }

    throw new Error(`Shiprocket Auth Error: ${errorMsg}`);
  }
}

// Indian Pincode Zone Mapping Helper for Instant Lookup & Fallback
const PINCODE_STATE_MAP = {
  '11': { city: 'New Delhi', state: 'Delhi' },
  '12': { city: 'Gurugram / Faridabad', state: 'Haryana' },
  '13': { city: 'Ambala / Panipat', state: 'Haryana' },
  '14': { city: 'Ludhiana / Chandigarh', state: 'Punjab' },
  '15': { city: 'Bathinda', state: 'Punjab' },
  '16': { city: 'Chandigarh', state: 'Punjab' },
  '17': { city: 'Shimla', state: 'Himachal Pradesh' },
  '18': { city: 'Jammu', state: 'Jammu & Kashmir' },
  '19': { city: 'Srinagar', state: 'Jammu & Kashmir' },
  '20': { city: 'Noida / Aligarh', state: 'Uttar Pradesh' },
  '21': { city: 'Prayagraj (Allahabad)', state: 'Uttar Pradesh' },
  '22': { city: 'Lucknow / Varanasi', state: 'Uttar Pradesh' },
  '23': { city: 'Mirzapur', state: 'Uttar Pradesh' },
  '24': { city: 'Bareilly / Dehradun', state: 'Uttar Pradesh / Uttarakhand' },
  '25': { city: 'Meerut', state: 'Uttar Pradesh' },
  '26': { city: 'Haldwani', state: 'Uttarakhand' },
  '27': { city: 'Gorakhpur', state: 'Uttar Pradesh' },
  '28': { city: 'Agra / Jhansi', state: 'Uttar Pradesh' },
  '30': { city: 'Jaipur', state: 'Rajasthan' },
  '31': { city: 'Udaipur', state: 'Rajasthan' },
  '32': { city: 'Kota', state: 'Rajasthan' },
  '33': { city: 'Bikaner', state: 'Rajasthan' },
  '34': { city: 'Jodhpur', state: 'Rajasthan' },
  '36': { city: 'Rajkot', state: 'Gujarat' },
  '37': { city: 'Jamnagar / Bhuj', state: 'Gujarat' },
  '38': { city: 'Ahmedabad', state: 'Gujarat' },
  '39': { city: 'Surat / Vadodara', state: 'Gujarat' },
  '40': { city: 'Mumbai', state: 'Maharashtra' },
  '41': { city: 'Pune', state: 'Maharashtra' },
  '42': { city: 'Nashik / Thane', state: 'Maharashtra' },
  '43': { city: 'Aurangabad', state: 'Maharashtra' },
  '44': { city: 'Nagpur', state: 'Maharashtra' },
  '45': { city: 'Indore', state: 'Madhya Pradesh' },
  '46': { city: 'Bhopal', state: 'Madhya Pradesh' },
  '47': { city: 'Gwalior', state: 'Madhya Pradesh' },
  '48': { city: 'Jabalpur', state: 'Madhya Pradesh' },
  '49': { city: 'Raipur', state: 'Chhattisgarh' },
  '50': { city: 'Hyderabad', state: 'Telangana' },
  '51': { city: 'Tirupati / Kurnool', state: 'Andhra Pradesh' },
  '52': { city: 'Vijayawada / Guntur', state: 'Andhra Pradesh' },
  '53': { city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  '56': { city: 'Bengaluru', state: 'Karnataka' },
  '57': { city: 'Mangalore / Mysuru', state: 'Karnataka' },
  '58': { city: 'Hubli / Belgaum', state: 'Karnataka' },
  '59': { city: 'Belagavi', state: 'Karnataka' },
  '60': { city: 'Chennai', state: 'Tamil Nadu' },
  '61': { city: 'Tiruchirappalli', state: 'Tamil Nadu' },
  '62': { city: 'Madurai', state: 'Tamil Nadu' },
  '63': { city: 'Salem / Vellore', state: 'Tamil Nadu' },
  '64': { city: 'Coimbatore', state: 'Tamil Nadu' },
  '67': { city: 'Kozhikode', state: 'Kerala' },
  '68': { city: 'Kochi / Thrissur', state: 'Kerala' },
  '69': { city: 'Thiruvananthapuram', state: 'Kerala' },
  '70': { city: 'Kolkata', state: 'West Bengal' },
  '71': { city: 'Howrah / Burdwan', state: 'West Bengal' },
  '72': { city: 'Midnapore', state: 'West Bengal' },
  '73': { city: 'Siliguri', state: 'West Bengal' },
  '74': { city: 'North 24 Parganas', state: 'West Bengal' },
  '75': { city: 'Bhubaneswar / Cuttack', state: 'Odisha' },
  '78': { city: 'Guwahati', state: 'Assam' },
  '80': { city: 'Patna', state: 'Bihar' },
  '81': { city: 'Bhagalpur', state: 'Bihar' },
  '82': { city: 'Gaya', state: 'Bihar' },
  '83': { city: 'Ranchi', state: 'Jharkhand' },
  '84': { city: 'Muzaffarpur', state: 'Bihar' }
};

function calculateShippingCharge(pincode, weightKg = 0.15) {
  const clean = String(pincode || '').trim().replace(/\D/g, '');
  if (!clean || clean.length !== 6) return 50;

  const prefix = clean.substring(0, 2);
  const prefix3 = clean.substring(0, 3);

  // Local Mumbai / Thane Zone (origin Bhiwandi 421302)
  if (prefix === '40' || prefix3 === '421') {
    return 40;
  }
  // Maharashtra & Gujarat Zone
  if (['41', '42', '43', '44', '38', '39'].includes(prefix)) {
    return 50;
  }
  // North / South / Metro Zone (Delhi, Bangalore, Hyderabad, UP, Rajasthan, etc.)
  if (['11', '12', '13', '14', '16', '20', '21', '22', '24', '25', '28', '30', '50', '56', '60', '70', '80'].includes(prefix)) {
    return 65;
  }
  // Special / Remote / J&K / North-East Zone
  if (['17', '18', '19', '78', '79'].includes(prefix)) {
    return 85;
  }
  return 60;
}

const shiprocketService = {
  calculateShippingCharge,

  // Check Pincode Serviceability & Dynamic Courier Rates
  checkServiceability: async (pincode, isCod = true, weight = 0.15) => {
    const cleanPincode = String(pincode).trim().replace(/\D/g, '');
    if (!/^[1-9][0-9]{5}$/.test(cleanPincode)) {
      return {
        isServiceable: false,
        message: 'Invalid 6-digit Indian pincode format.'
      };
    }

    const prefix = cleanPincode.substring(0, 2);
    const locationInfo = PINCODE_STATE_MAP[prefix] || { city: 'Serviceable Area', state: 'India' };
    const dynamicCharge = calculateShippingCharge(cleanPincode, weight);

    try {
      const token = await getAuthToken();
      if (isConfigured && !token.startsWith('mock_jwt_')) {
        try {
          const res = await axios.get(`${config.shiprocket.baseUrl}/courier/serviceability/`, {
            params: {
              pickup_postcode: '421302',
              delivery_postcode: cleanPincode,
              weight: weight || 0.15,
              cod: isCod ? 1 : 0
            },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          });

          if (res.data && res.data.data && res.data.data.available_courier_companies) {
            const couriers = res.data.data.available_courier_companies;
            if (couriers.length > 0) {
              const bestCourier = couriers[0];
              const courierNames = couriers.slice(0, 3).map(c => c.courier_name);
              const liveRate = Math.round(Number(bestCourier.rate) || dynamicCharge);

              return {
                isServiceable: true,
                pincode: cleanPincode,
                city: locationInfo.city,
                state: locationInfo.state,
                shippingCharge: liveRate,
                estimatedDays: bestCourier.etd ? `${bestCourier.etd} Days` : '3-4 Business Days',
                codAvailable: Boolean(bestCourier.cod),
                couriers: courierNames,
                deliveryType: 'Express Courier Delivery'
              };
            }
          }
        } catch (apiErr) {
          logger.warn('SHIPROCKET_SERVICEABILITY_API_FALLBACK', { error: apiErr.message });
        }
      }

      // Valid Indian Pincode Fallback / Test Simulation with dynamic distance rate
      return {
        isServiceable: true,
        pincode: cleanPincode,
        city: locationInfo.city,
        state: locationInfo.state,
        shippingCharge: dynamicCharge,
        estimatedDays: '3-4 Business Days',
        codAvailable: true,
        couriers: ['BlueDart Express', 'Delhivery Surface', 'DTDC Air'],
        deliveryType: 'Express Delivery with Tracking'
      };
    } catch (err) {
      logger.error('SERVICEABILITY_CHECK_ERROR', { error: err.message });
      return {
        isServiceable: true,
        pincode: cleanPincode,
        city: locationInfo.city,
        state: locationInfo.state,
        shippingCharge: dynamicCharge,
        estimatedDays: '3-5 Business Days',
        codAvailable: true,
        couriers: ['Standard Express Delivery'],
        deliveryType: 'Standard Delivery'
      };
    }
  },

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
        pickup_location: config.shiprocket.pickupLocation || 'Primary',
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
        // 1. Create Adhoc Order with live Shiprocket API
        const createRes = await axios.post(
          `${config.shiprocket.baseUrl}/orders/create/adhoc`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000
          }
        );

        const shipData = createRes.data;
        if (!shipData || (!shipData.order_id && !shipData.shipment_id)) {
          const msg = shipData?.message || (Array.isArray(shipData?.errors) ? shipData.errors.join(', ') : 'Shiprocket order creation failed.');
          throw new Error(`Shiprocket Order Creation Error: ${msg}`);
        }

        const shiprocketOrderId = shipData.order_id;
        const shipmentId = shipData.shipment_id;

        logger.info('SHIPROCKET_ORDER_CREATED_LIVE', {
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

            logger.info('SHIPROCKET_AWB_ASSIGNED_LIVE', {
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
          courierName: courierName || 'Shiprocket Express Partner',
          trackingUrl: trackingUrl || `https://shiprocket.co/tracking/${shiprocketOrderId}`,
          bookedAt: new Date().toISOString()
        };
      }

      // If credentials are dummy/mock only
      const mockShiprocketOrderId = `SR_${Math.floor(10000000 + Math.random() * 90000000)}`;
      const mockShipmentId = `SH_${Math.floor(1000000 + Math.random() * 9000000)}`;
      const mockAwb = `AWB${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const mockCourier = 'Shiprocket Express (BlueDart / Delhivery)';

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
      const errorMsg = err.response?.data?.message || (err.response?.data?.errors ? JSON.stringify(err.response.data.errors) : err.message);
      logger.error('SHIPMENT_FAILED', {
        internalOrderId: order.orderId,
        error: errorMsg
      });
      const error = new Error(`Shiprocket Error: ${errorMsg}`);
      error.code = 'SHIPROCKET_API_ERROR';
      throw error;
    }
  },

  _setForceFailNextShipment: (val) => {
    forceFailNextShipment = val;
  }
};

module.exports = shiprocketService;

const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

const isConfigured = Boolean(
  config.delhivery &&
  config.delhivery.apiKey &&
  !config.delhivery.apiKey.includes('dummy')
);

const delhiveryService = {
  isConfigured: () => isConfigured,

  /**
   * Check delivery pincode serviceability on Delhivery
   */
  checkServiceability: async (pincode, isCod = false, weightKg = 0.15) => {
    const cleanPin = String(pincode || '').replace(/\D/g, '').slice(0, 6);
    if (cleanPin.length !== 6) {
      return { serviceable: false, message: 'Invalid 6-digit pincode' };
    }

    try {
      const response = await axios.get(
        `${config.delhivery.baseUrl}/c/api/pin-codes/json/?filter_codes=${cleanPin}`,
        {
          headers: {
            'Authorization': `Token ${config.delhivery.apiKey}`,
            'Accept': 'application/json'
          },
          timeout: 8000
        }
      );

      const deliveryCodes = response.data?.delivery_codes;
      if (Array.isArray(deliveryCodes) && deliveryCodes.length > 0) {
        const item = deliveryCodes[0]?.postal_code;
        if (item) {
          const isPrepaidAvail = item.pre_paid === 'Y';
          const isCodAvail = item.cod === 'Y';
          const isEligible = isCod ? isCodAvail : isPrepaidAvail;

          return {
            serviceable: isEligible,
            pincode: cleanPin,
            city: item.city || item.district || '',
            state: item.state_code || '',
            codAvailable: isCodAvail,
            prepaidAvailable: isPrepaidAvail,
            courierName: 'Delhivery Surface / Express'
          };
        }
      }

      return {
        serviceable: false,
        pincode: cleanPin,
        message: 'Pincode not currently serviceable by Delhivery'
      };
    } catch (err) {
      logger.warn('DELHIVERY_SERVICEABILITY_CHECK_ERROR', { pincode: cleanPin, error: err.message });
      return {
        serviceable: true, // fallback to avoid blocking
        pincode: cleanPin,
        courierName: 'Delhivery Partner'
      };
    }
  },

  /**
   * Create shipment on Delhivery (B2C / CMU Manifestation)
   * API: POST https://track.delhivery.com/api/cmu/create.json
   * Supports: Surface and Express modes
   */
  createShipment: async (order, options = {}) => {
    // Determine shipping mode: Surface or Express (defaults to Surface)
    const requestedMode = (options && options.shippingMode) || order.shippingMode || order.shipping?.shippingMode || 'Surface';
    const shippingMode = String(requestedMode).toLowerCase() === 'express' ? 'Express' : 'Surface';

    if (!isConfigured) {
      logger.warn('DELHIVERY_NOT_CONFIGURED_MOCK_FALLBACK', { shippingMode });
      const mockWaybill = `DEL${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      return {
        provider: 'delhivery',
        status: 'AWB_ASSIGNED',
        delhiveryOrderId: order.orderId,
        shipmentId: mockWaybill,
        waybill: mockWaybill,
        awb: mockWaybill,
        shippingMode: shippingMode,
        courierName: `Delhivery ${shippingMode} (Mock)`,
        trackingUrl: `https://www.delhivery.com/track/package/${mockWaybill}`,
        bookedAt: new Date().toISOString()
      };
    }

    try {
      const isCod =
        (order.payment && order.payment.provider === 'COD') ||
        order.paymentMethod === 'cod';

      const totalAmount = Math.round(
        order.pricing?.total ||
        (order.payment?.amountPaise ? order.payment.amountPaise / 100 : 0)
      );

      const itemsDesc = (order.items || [])
        .map(i => `${i.name || i.title || 'Product'}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity || 1}`)
        .join(', ')
        .slice(0, 240) || 'Islamic Products Flashcards Kit';

      const totalQty = (order.items || []).reduce((acc, i) => acc + (parseInt(i.quantity, 10) || 1), 0);

      // Weight in grams for Delhivery
      const weightGrams = Math.max(100, Math.round((order.package?.weight || 0.15) * 1000));
      const lengthCm = Math.max(5, Math.round(order.package?.length || 15));
      const widthCm = Math.max(5, Math.round(order.package?.breadth || 10));
      const heightCm = Math.max(2, Math.round(order.package?.height || 5));

      const customerPhone = String(order.customer?.phone || '').replace(/\D/g, '').slice(-10);
      const customerPincode = String(order.customer?.pincode || '').replace(/\D/g, '').slice(0, 6);
      const customerAddress = [
        order.customer?.address1 || order.customer?.addressLine1 || '',
        order.customer?.address2 || order.customer?.addressLine2 || ''
      ].filter(Boolean).join(', ');

      const orderDateStr = new Date(order.createdAt || Date.now())
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);

      const pickupLocationName = config.delhivery.pickupLocation || 'FATIMACALLIGRAPHER27 B2C';

      const shipmentObj = {
        name: order.customer?.name || 'Customer',
        add: customerAddress || 'Address Provided on Order',
        pin: customerPincode,
        city: order.customer?.city || 'City',
        state: order.customer?.state || 'State',
        country: 'India',
        phone: customerPhone,
        order: String(order.orderId),
        payment_mode: isCod ? 'COD' : 'Prepaid',
        products_desc: itemsDesc,
        hsn_code: '4910',
        cod_amount: isCod ? String(totalAmount) : '0',
        order_date: orderDateStr,
        total_amount: String(totalAmount),
        seller_name: 'Fatima Calligrapher',
        seller_add: '',
        seller_inv: '',
        quantity: String(totalQty || 1),
        waybill: '', // Leave blank to let Delhivery dynamically assign a waybill
        shipment_width: String(widthCm),
        shipment_height: String(heightCm),
        shipment_length: String(lengthCm),
        weight: String(weightGrams),
        shipping_mode: shippingMode, // Delhivery CMU transit mode: 'Surface' or 'Express'
        mode: shippingMode
      };

      const payload = {
        pickup_location: {
          name: pickupLocationName
        },
        shipments: [shipmentObj]
      };

      logger.info('DELHIVERY_CREATING_SHIPMENT', {
        orderId: order.orderId,
        paymentMode: shipmentObj.payment_mode,
        shippingMode,
        totalAmount,
        pincode: customerPincode,
        pickupLocationName
      });

      const bodyData = `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`;

      const response = await axios.post(
        `${config.delhivery.baseUrl}/api/cmu/create.json`,
        bodyData,
        {
          headers: {
            'Authorization': `Token ${config.delhivery.apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          timeout: 20000
        }
      );

      const resData = response.data;
      logger.info('DELHIVERY_API_RESPONSE', {
        orderId: order.orderId,
        success: resData?.success,
        packagesCount: resData?.packages?.length
      });

      if (!resData) {
        throw new Error('Empty response received from Delhivery API.');
      }

      // Check packages array
      const pkg = Array.isArray(resData.packages) && resData.packages.length > 0 ? resData.packages[0] : null;

      if (pkg && (pkg.status === 'Success' || pkg.waybill)) {
        const waybill = String(pkg.waybill);
        logger.info('DELHIVERY_SHIPMENT_CREATED_SUCCESS', {
          orderId: order.orderId,
          waybill,
          shippingMode
        });

        return {
          provider: 'delhivery',
          status: 'AWB_ASSIGNED',
          delhiveryOrderId: waybill,
          shipmentId: waybill,
          waybill: waybill,
          awb: waybill,
          shippingMode: shippingMode,
          courierName: `Delhivery ${shippingMode}`,
          trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
          bookedAt: new Date().toISOString()
        };
      }

      // If failed or error remarks
      const remarks = pkg?.remarks?.filter(Boolean).join(', ') ||
                      (Array.isArray(resData.rmrs) ? resData.rmrs.join(', ') : '') ||
                      resData.rmk ||
                      resData.error ||
                      'Delhivery shipment creation failed';

      logger.error('DELHIVERY_BOOKING_REJECTED', {
        orderId: order.orderId,
        remarks,
        response: resData
      });

      throw new Error(`Delhivery booking failed: ${remarks}`);
    } catch (err) {
      const errMsg = err.response?.data?.rmk ||
                     err.response?.data?.error ||
                     (err.response?.data?.rmrs && err.response.data.rmrs.join(', ')) ||
                     err.message;

      logger.error('DELHIVERY_CREATE_SHIPMENT_FAILED', {
        orderId: order.orderId,
        error: errMsg,
        status: err.response?.status
      });

      throw new Error(errMsg);
    }
  },

  /**
   * Track shipment status by waybill
   */
  trackShipment: async (waybill) => {
    try {
      const response = await axios.get(
        `${config.delhivery.baseUrl}/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}`,
        {
          headers: {
            'Authorization': `Token ${config.delhivery.apiKey}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (err) {
      logger.error('DELHIVERY_TRACK_ERROR', { waybill, error: err.message });
      throw err;
    }
  },

  /**
   * Generate official shipping packing slip / label URL
   */
  generateShippingLabel: async (waybill) => {
    const labelUrl = `${config.delhivery.baseUrl}/api/p/packing_slip?wbns=${encodeURIComponent(waybill)}&pdf=true`;
    return {
      labelUrl
    };
  },

  /**
   * Cancel shipment on Delhivery
   */
  cancelOrder: async (waybill) => {
    if (!waybill) return { success: true };

    try {
      const response = await axios.post(
        `${config.delhivery.baseUrl}/api/p/edit`,
        {
          waybill: String(waybill),
          cancellation: 'true'
        },
        {
          headers: {
            'Authorization': `Token ${config.delhivery.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      logger.info('DELHIVERY_ORDER_CANCELLED', { waybill, data: response.data });
      return { success: true, data: response.data };
    } catch (err) {
      logger.warn('DELHIVERY_CANCEL_ERROR', { waybill, error: err.message });
      return { success: false, error: err.message };
    }
  },

  /**
   * Update shipment / delivery details on Delhivery via official Edit API
   * API: POST https://track.delhivery.com/api/p/edit
   * Updatable: name, phone, add, cod, pt, gm, shipment_length, shipment_width, shipment_height, product_details
   */
  updateShipment: async (waybill, updates = {}) => {
    if (!waybill) {
      throw new Error('Delhivery Waybill / AWB is required to update delivery details.');
    }

    if (!isConfigured) {
      logger.warn('DELHIVERY_NOT_CONFIGURED_MOCK_UPDATE', { waybill, updates });
      return {
        success: true,
        waybill,
        message: 'Delhivery Mock: Shipment updated successfully.',
        updatedFields: updates
      };
    }

    try {
      const payload = {
        waybill: String(waybill)
      };

      if (updates.name) payload.name = String(updates.name).trim();
      if (updates.phone) payload.phone = String(updates.phone).replace(/\D/g, '').slice(-10);
      if (updates.address || updates.add) payload.add = String(updates.address || updates.add).trim();
      if (updates.cod !== undefined && updates.cod !== null && updates.cod !== '') {
        payload.cod = parseFloat(updates.cod) || 0;
      }
      if (updates.paymentMode || updates.pt) {
        payload.pt = String(updates.paymentMode || updates.pt).toLowerCase() === 'cod' ? 'Cod' : 'Pre-paid';
      }
      if (updates.weightGrams || updates.gm) {
        payload.gm = parseFloat(updates.weightGrams || updates.gm) || 500;
      }
      if (updates.length || updates.shipment_length) payload.shipment_length = parseFloat(updates.length || updates.shipment_length) || 10;
      if (updates.width || updates.shipment_width) payload.shipment_width = parseFloat(updates.width || updates.shipment_width) || 10;
      if (updates.height || updates.shipment_height) payload.shipment_height = parseFloat(updates.height || updates.shipment_height) || 5;
      if (updates.productDetails || updates.product_details) {
        payload.product_details = String(updates.productDetails || updates.product_details).slice(0, 240);
      }

      logger.info('DELHIVERY_UPDATE_SHIPMENT_REQUEST', { waybill, payload });

      const response = await axios.post(
        `${config.delhivery.baseUrl}/api/p/edit`,
        payload,
        {
          headers: {
            'Authorization': `Token ${config.delhivery.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 15000
        }
      );

      const resData = response.data;
      logger.info('DELHIVERY_UPDATE_SHIPMENT_RESPONSE', { waybill, response: resData });

      const isFailed = resData?.status === false || 
                       resData?.status === 'Failed' || 
                       resData?.status === 'Error' ||
                       resData?.error;

      if (isFailed) {
        const errorMsg = resData?.remark || resData?.rmk || resData?.message || resData?.error || 'Delhivery update rejected by carrier';
        throw new Error(`Delhivery update failed: ${errorMsg}`);
      }

      return {
        success: true,
        waybill,
        message: resData?.message || resData?.remark || 'Delhivery shipment details updated successfully.',
        data: resData
      };
    } catch (err) {
      const errMsg = err.response?.data?.remark ||
                     err.response?.data?.rmk ||
                     err.response?.data?.error ||
                     err.response?.data?.message ||
                     err.message;

      logger.error('DELHIVERY_UPDATE_SHIPMENT_FAILED', {
        waybill,
        error: errMsg,
        status: err.response?.status
      });

      throw new Error(errMsg);
    }
  },

  /**
   * Sync and parse real-time tracking status from Delhivery Tracking API
   * API: GET https://track.delhivery.com/api/v1/packages/json/?waybill=...
   */
  syncDeliveryStatus: async (waybill) => {
    if (!waybill) {
      throw new Error('Delhivery Waybill is required to sync status.');
    }

    if (!isConfigured) {
      return {
        success: true,
        rawStatus: 'Mock In Transit',
        statusLocation: 'Delhi Hub',
        statusDateTime: new Date().toISOString(),
        instructions: 'Mock Package in Transit',
        message: 'Delhivery Mock: Status checked successfully.'
      };
    }

    const trackingData = await delhiveryService.trackShipment(waybill);
    const shipmentObj = trackingData?.ShipmentData?.[0]?.Shipment || trackingData?.packages?.[0] || {};
    const statusObj = shipmentObj?.Status || {};
    const rawStatus = (statusObj.Status || shipmentObj.status || '').trim();

    return {
      success: true,
      rawStatus: rawStatus || 'Manifested',
      statusDateTime: statusObj.StatusDateTime,
      statusLocation: statusObj.StatusLocation,
      instructions: statusObj.Instructions,
      expectedDeliveryDate: shipmentObj.ExpectedDeliveryDate,
      fullData: trackingData
    };
  }
};

module.exports = delhiveryService;

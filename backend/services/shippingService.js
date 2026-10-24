const shiprocketService = require('./shiprocketService');
const delhiveryService = require('./delhiveryService');
const logger = require('../utils/logger');

/**
 * Registry of available shipping providers.
 * Easily extensible to add new couriers in the future (e.g. Bluedart, Xpressbees, DTDC, etc.)
 */
const carriers = {
  shiprocket: {
    id: 'shiprocket',
    name: 'Shiprocket',
    service: shiprocketService
  },
  delhivery: {
    id: 'delhivery',
    name: 'Delhivery',
    service: delhiveryService
  }
};

const shippingService = {
  /**
   * Get list of supported couriers
   */
  getSupportedCouriers: () => {
    return Object.keys(carriers).map(k => ({
      id: carriers[k].id,
      name: carriers[k].name
    }));
  },

  /**
   * Book shipment for an order with specified courier
   * @param {Object} order - Full order object
   * @param {string} courierName - 'shiprocket' | 'delhivery' | etc.
   */
  bookShipment: async (order, courierName = 'shiprocket') => {
    const courierKey = String(courierName || 'shiprocket').toLowerCase().trim();
    const carrier = carriers[courierKey];

    if (!carrier) {
      throw new Error(`Unsupported courier '${courierName}'. Available couriers: ${Object.keys(carriers).join(', ')}`);
    }

    logger.info('DISPATCHING_SHIPMENT_TO_CARRIER', {
      orderId: order.orderId,
      carrier: carrier.name
    });

    const shipmentDetails = await carrier.service.createShipment(order);

    return {
      provider: carrier.id,
      courierName: shipmentDetails.courierName || `${carrier.name} Express`,
      status: shipmentDetails.status || 'BOOKED',
      awb: shipmentDetails.awb,
      waybill: shipmentDetails.waybill || shipmentDetails.awb,
      shiprocketOrderId: shipmentDetails.shiprocketOrderId || null,
      shipmentId: shipmentDetails.shipmentId || null,
      trackingUrl: shipmentDetails.trackingUrl,
      bookedAt: shipmentDetails.bookedAt || new Date().toISOString()
    };
  },

  /**
   * Cancel shipment across providers
   */
  cancelShipment: async (order) => {
    const provider = (order.shipping?.provider || 'shiprocket').toLowerCase();

    if (provider === 'delhivery') {
      const waybill = order.shipping?.awb || order.shipping?.waybill;
      return await delhiveryService.cancelOrder(waybill);
    } else {
      const srOrderId = order.shipping?.shiprocketOrderId;
      return await shiprocketService.cancelOrder(srOrderId);
    }
  },

  /**
   * Generate label URL across providers
   */
  generateShippingLabel: async (order) => {
    const provider = (order.shipping?.provider || 'shiprocket').toLowerCase();

    if (provider === 'delhivery') {
      const waybill = order.shipping?.awb || order.shipping?.waybill;
      if (!waybill) {
        throw new Error('No Delhivery AWB/Waybill found for this order.');
      }
      return await delhiveryService.generateShippingLabel(waybill);
    } else {
      const shipmentId = order.shipping?.shipmentId;
      const srOrderId = order.shipping?.shiprocketOrderId;
      return await shiprocketService.generateShippingLabel(shipmentId, srOrderId);
    }
  }
};

module.exports = shippingService;

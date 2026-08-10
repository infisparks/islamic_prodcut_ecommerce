const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * SHA-256 Hashing helper according to Meta Conversions API requirements.
 * Meta requires strings to be trimmed, lowercased, and hashed with SHA-256.
 */
function hashMetaField(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim().toLowerCase();
  if (!clean) return null;
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Clean phone numbers to international E.164 format (defaulting to India +91 if 10 digits)
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return digits ? crypto.createHash('sha256').update(digits).digest('hex') : null;
}

class MetaCapiService {
  constructor() {
    this.pixelId = config.meta.pixelId;
    this.accessToken = config.meta.accessToken;
    this.testEventCode = config.meta.testEventCode;
  }

  /**
   * Send single or multiple events to Meta Conversions API
   * @param {Object} params
   * @param {string} params.eventName - e.g. 'PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'
   * @param {string} params.eventId - Unique Event ID for deduplication with browser pixel
   * @param {string} [params.eventSourceUrl] - URL where event occurred
   * @param {Object} [params.userData] - Raw user data (email, phone, ip, userAgent, fbc, fbp, name, city, state, zip)
   * @param {Object} [params.customData] - E-commerce data (currency, value, content_name, contents, num_items, order_id)
   */
  async sendEvent({
    eventName,
    eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    eventSourceUrl = 'https://mantasha.store',
    userData = {},
    customData = {}
  }) {
    const pixelId = config.meta.pixelId || this.pixelId;
    const accessToken = config.meta.accessToken || this.accessToken;
    const testEventCode = config.meta.testEventCode || this.testEventCode;

    // Build hashed user_data block required by Meta CAPI
    const formattedUserData = {
      client_ip_address: userData.clientIp || userData.client_ip_address || undefined,
      client_user_agent: userData.clientUserAgent || userData.client_user_agent || undefined,
      fbc: userData.fbc || undefined,
      fbp: userData.fbp || undefined
    };

    const hashedEmail = hashMetaField(userData.email);
    if (hashedEmail) formattedUserData.em = [hashedEmail];

    const hashedPhone = normalizePhone(userData.phone);
    if (hashedPhone) formattedUserData.ph = [hashedPhone];

    const hashedFirstName = hashMetaField(userData.firstName || userData.first_name || userData.name?.split(' ')[0]);
    if (hashedFirstName) formattedUserData.fn = [hashedFirstName];

    const hashedLastName = hashMetaField(userData.lastName || userData.last_name || userData.name?.split(' ').slice(1).join(' '));
    if (hashedLastName) formattedUserData.ln = [hashedLastName];

    const hashedCity = hashMetaField(userData.city);
    if (hashedCity) formattedUserData.ct = [hashedCity];

    const hashedState = hashMetaField(userData.state);
    if (hashedState) formattedUserData.st = [hashedState];

    const hashedZip = hashMetaField(userData.zip || userData.pincode);
    if (hashedZip) formattedUserData.zp = [hashedZip];

    const hashedCountry = hashMetaField(userData.country || 'in');
    if (hashedCountry) formattedUserData.country = [hashedCountry];

    const eventPayload = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl,
      action_source: 'website',
      user_data: formattedUserData,
      custom_data: customData
    };

    const apiBody = {
      data: [eventPayload]
    };

    if (testEventCode) {
      apiBody.test_event_code = testEventCode;
    }

    // Console Server Log output as requested by user
    console.log(`\n=============================================================`);
    console.log(`📊 [META CAPI LOG] Event Received in Backend Server!`);
    console.log(`-------------------------------------------------------------`);
    console.log(`🎯 Event Name   : ${eventName.toUpperCase()}`);
    console.log(`🆔 Event ID     : ${eventId}`);
    console.log(`🆔 Pixel ID     : ${pixelId}`);
    console.log(`💻 Action Source: website`);
    if (customData && customData.value !== undefined) {
      console.log(`💰 Value        : ₹${customData.value} ${customData.currency || 'INR'}`);
    }
    if (customData && customData.order_id) {
      console.log(`📦 Order ID     : ${customData.order_id}`);
    }

    if (!accessToken) {
      console.log(`⚠️ META_ACCESS_TOKEN not configured in .env file.`);
      console.log(`✅ [LOCAL SERVER LOG] Meta Event Received: 1 (Logged successfully in server console)`);
      console.log(`=============================================================\n`);

      logger.info('META_CAPI_EVENT_LOGGED_LOCAL', {
        eventName,
        eventId,
        pixelId,
        customData
      });

      return {
        success: true,
        mode: 'local_logged',
        eventId,
        eventsReceived: 1,
        message: 'Event logged in backend server. Add META_ACCESS_TOKEN in .env to dispatch live to Meta servers.'
      };
    }

    try {
      const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
      const response = await axios.post(url, apiBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000
      });

      const eventsReceivedCount = response.data?.events_received || 1;

      console.log(`✅ [META CAPI GRAPH API] Meta received ${eventsReceivedCount} event!`);
      console.log(`=============================================================\n`);

      logger.info('META_CAPI_EVENT_SUCCESS', {
        eventName,
        eventId,
        pixelId,
        eventsReceived: eventsReceivedCount,
        fbTraceId: response.data?.fbtrace_id
      });

      return {
        success: true,
        eventId,
        eventsReceived: eventsReceivedCount,
        fbTraceId: response.data?.fbtrace_id
      };
    } catch (err) {
      const errorDetail = err.response?.data || err.message;
      console.error(`❌ [META CAPI API ERROR] Failed to send event to Meta:`, errorDetail);
      console.log(`=============================================================\n`);

      logger.error('META_CAPI_EVENT_FAILED', {
        eventName,
        eventId,
        error: errorDetail
      });

      return {
        success: false,
        eventId,
        error: errorDetail
      };
    }
  }
}

module.exports = new MetaCapiService();

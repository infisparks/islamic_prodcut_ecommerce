const express = require('express');
const router = express.Router();
const metaCapiService = require('../services/metaCapiService');
const config = require('../config/env');

/**
 * GET /api/meta/config
 * Returns current Meta Pixel ID configuration
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    pixelId: config.meta.pixelId,
    hasAccessToken: Boolean(config.meta.accessToken)
  });
});

/**
 * POST /api/meta/event
 * Receive browser client events and forward to Meta Conversions API (CAPI)
 */
router.post('/event', async (req, res, next) => {
  try {
    const { eventName, eventId, eventSourceUrl, userData = {}, customData = {} } = req.body;

    if (!eventName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_EVENT_NAME',
          message: 'eventName is required.'
        }
      });
    }

    // Extract client IP and user-agent from Express request
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || req.ip;
    const clientUserAgent = req.headers['user-agent'];

    const fullUserData = {
      clientIp,
      clientUserAgent,
      ...userData
    };

    const result = await metaCapiService.sendEvent({
      eventName,
      eventId,
      eventSourceUrl: eventSourceUrl || req.headers.referer || req.headers.origin || 'https://mantasha.store',
      userData: fullUserData,
      customData
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

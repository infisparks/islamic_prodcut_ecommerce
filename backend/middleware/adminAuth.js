const axios = require('axios');
const admin = require('firebase-admin');
const config = require('../config/env');
const logger = require('../utils/logger');

// Optional Admin email whitelist from environment (comma-separated)
const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Admin Authentication Middleware using Firebase Auth
 * Verifies the Firebase ID token sent in the Authorization header.
 */
async function verifyAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authorization token is required.'
      }
    });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();

  // Test token bypass for automated test suites
  if ((config.nodeEnv === 'development' || config.nodeEnv === 'test') && idToken === 'mock_admin_token_for_tests') {
    req.adminUser = {
      uid: 'admin_test_uid',
      email: 'admin@fatimacalligrapher.com'
    };
    return next();
  }

  try {
    let email = null;
    let uid = null;

    // 1. Try Firebase Auth REST lookup via apiKey
    if (config.firebase.apiKey) {
      try {
        const response = await axios.post(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${config.firebase.apiKey}`,
          { idToken },
          { timeout: 8000 }
        );

        if (response.data && response.data.users && response.data.users.length > 0) {
          const user = response.data.users[0];
          email = (user.email || '').toLowerCase();
          uid = user.localId;
        }
      } catch (restErr) {
        // Continue to Admin SDK fallback if available
      }
    }

    // 2. Fallback to Firebase Admin SDK verifyIdToken if initialized
    if (!email && admin.apps.length > 0) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        email = (decoded.email || '').toLowerCase();
        uid = decoded.uid;
      } catch (adminErr) {
        // Will handle below
      }
    }

    if (!email) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Firebase Authentication token is invalid or expired.'
        }
      });
    }

    // 3. If ADMIN_EMAILS whitelist is configured, enforce it
    if (adminEmails.length > 0 && !adminEmails.includes(email)) {
      logger.warn('ADMIN_ACCESS_DENIED_NON_WHITELISTED', { email });
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. The account (${email}) is not authorized as an administrator.`
        }
      });
    }

    req.adminUser = { uid, email };
    next();
  } catch (err) {
    logger.error('ADMIN_AUTH_ERROR', { error: err.message });
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_VERIFICATION_FAILED',
        message: 'Could not verify admin credentials.'
      }
    });
  }
}

module.exports = {
  verifyAdminAuth
};

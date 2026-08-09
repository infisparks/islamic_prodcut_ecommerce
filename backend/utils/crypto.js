const crypto = require('crypto');

/**
 * Generate secure internal order ID: FC-YYYYMMDD-XXXXXXXX
 */
function generateOrderId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${year}${month}${day}`;

  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `FC-${datePrefix}-${randomHex}`;
}

/**
 * Generate HMAC SHA256 hex digest
 */
function generateHmacSha256(data, secret) {
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Timing-safe signature comparison
 */
function verifyHmacSignature(data, signature, secret) {
  if (!data || !signature || !secret) {
    return false;
  }

  const expectedSignature = generateHmacSha256(data, secret);
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

module.exports = {
  generateOrderId,
  generateHmacSha256,
  verifyHmacSignature
};

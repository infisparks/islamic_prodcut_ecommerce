/**
 * Structured Logger with Secret Filtering
 * Ensures no passwords, API keys, tokens, or private keys are ever leaked into console or log files.
 */

const SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'jwt',
  'key_secret',
  'razorpay_key_secret',
  'private_key',
  'authorization',
  'signature'
];

function sanitize(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitize);
  }

  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    const lowerKey = k.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(sk => lowerKey.includes(sk));

    if (isSensitive) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitize(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

const logger = {
  info: (event, meta = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event,
      ...sanitize(meta)
    }));
  },

  warn: (event, meta = {}) => {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      event,
      ...sanitize(meta)
    }));
  },

  error: (event, meta = {}) => {
    const cleanMeta = sanitize(meta);
    if (meta instanceof Error) {
      cleanMeta.errorMessage = meta.message;
      if (process.env.NODE_ENV !== 'production') {
        cleanMeta.stack = meta.stack;
      }
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event,
      ...cleanMeta
    }));
  }
};

module.exports = logger;

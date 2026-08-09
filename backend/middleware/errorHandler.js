const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error('UNHANDLED_SERVER_ERROR', err);

  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.isPublic ? err.message : 'An unexpected error occurred. Please try again or contact support.';

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: message
    }
  });
}

module.exports = errorHandler;

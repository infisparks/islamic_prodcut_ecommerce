const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error('UNHANDLED_SERVER_ERROR', err);

  const isEnoent = err.code === 'ENOENT';
  const statusCode = err.statusCode || (isEnoent ? 404 : 500);
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.isPublic 
    ? err.message 
    : (isEnoent ? 'The requested file or page was not found.' : 'An unexpected error occurred. Please try again or contact support.');

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: message
    }
  });
}

module.exports = errorHandler;

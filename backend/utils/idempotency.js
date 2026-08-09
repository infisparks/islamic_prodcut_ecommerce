/**
 * Memory/State Idempotency Lock
 * Prevents race conditions and double executions for the same order/event.
 */

const activeLocks = new Set();

async function withLock(key, fn) {
  if (activeLocks.has(key)) {
    const err = new Error(`Resource with key [${key}] is currently being processed.`);
    err.code = 'CONCURRENT_REQUEST';
    throw err;
  }

  activeLocks.add(key);
  try {
    return await fn();
  } finally {
    activeLocks.delete(key);
  }
}

module.exports = {
  withLock
};

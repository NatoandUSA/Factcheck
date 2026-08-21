/**
 * In-memory sliding window rate limiter middleware for authentication & API protection.
 * Prevents brute-force credential stuffing without external Redis dependency.
 */

const hitMap = new Map();

// Periodic cleanup every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of hitMap.entries()) {
    if (now > record.resetTime) {
      hitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

function createRateLimiter({ windowMs = 15 * 60 * 1000, maxHits = 15, message = 'Too many requests, please try again later.' } = {}) {
  return function rateLimiterMiddleware(req, res, next) {
    // In test environment, bypass rate limiting to allow automated test suites to run at full speed
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    let record = hitMap.get(key);
    if (!record || now > record.resetTime) {
      record = { hits: 1, resetTime: now + windowMs };
      hitMap.set(key, record);
      return next();
    }

    record.hits += 1;
    if (record.hits > maxHits) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message,
        retryAfterSeconds
      });
    }

    next();
  };
}

module.exports = { createRateLimiter };

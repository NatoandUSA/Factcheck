/**
 * In-memory sliding-window rate limiter middleware for authentication & API protection.
 * Prevents brute-force credential stuffing without external Redis dependency.
 */

const hitMap = new Map();

// Periodic cleanup every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of hitMap.entries()) {
    const valid = timestamps.filter(t => t > now - 15 * 60 * 1000);
    if (valid.length === 0) hitMap.delete(key);
    else hitMap.set(key, valid);
  }
}, 5 * 60 * 1000).unref();

function createRateLimiter({ windowMs = 15 * 60 * 1000, maxHits = 15, message = 'Too many requests, please try again later.', ignoreTestEnv = true, failOnly = false } = {}) {
  return function rateLimiterMiddleware(req, res, next) {
    if (ignoreTestEnv && process.env.NODE_ENV === 'test') {
      return next();
    }

    // Determine client IP safely, accounting for proxies/Cloudflare if trust-proxy is set
    const ip = req.ip || (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    let timestamps = hitMap.get(key) || [];
    // Keep only timestamps within windowMs
    timestamps = timestamps.filter(t => t > now - windowMs);
    hitMap.set(key, timestamps);

    if (timestamps.length >= maxHits) {
      const oldestHit = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestHit + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message,
        retryAfterSeconds
      });
    }

    if (failOnly) {
      // Record hit only if response finishes with an HTTP error status (4xx/5xx)
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          const current = hitMap.get(key) || [];
          current.push(Date.now());
          hitMap.set(key, current);
        }
      });
    } else {
      timestamps.push(now);
    }

    next();
  };
}

module.exports = { createRateLimiter };

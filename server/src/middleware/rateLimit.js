const { client } = require('../db/redis');

const LIMIT = 10;
const WINDOW = 1;

async function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const key = `ratelimit:${ip}`;

  try {
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, WINDOW);
    }

    if (count > LIMIT) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    next();
  } catch (err) {
    next(); // fail open
  }
}

module.exports = rateLimit;
const { verifyToken } = require('../services/auth.service');
const sessionService = require('../services/session.service');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = verifyToken(token);

    const session = await sessionService.validateSession(token);

    if (!session) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = decoded;
    next();

  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };
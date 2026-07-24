// server/src/middleware/auth.js

const { verifyToken } = require('../services/auth.service');
const sessionService = require('../services/session.service');
const { db } = require('../db/mongo');

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

/**
 * After requireAuth: loads the user doc and ensures account_type is organization.
 */
async function requireOrg(req, res, next) {
  try {
    const user = await db().collection('users').findOne(
      { _id: req.user.sub },
      { projection: { _id: 1, account_type: 1, org_name: 1, org_slug: 1, username: 1 } }
    );
    if (!user || user.account_type !== 'organization') {
      return res.status(403).json({ error: 'Organization account required' });
    }
    req.org = user;
    next();
  } catch (err) {
    console.error('requireOrg failed:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

module.exports = { requireAuth, requireOrg };

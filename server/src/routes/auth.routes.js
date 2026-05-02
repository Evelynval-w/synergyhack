const express = require('express');
const { signToken } = require('../services/auth.service');
const sessionService = require('../services/session.service');
const { db } = require('../db/mongo');

const router = express.Router();

// TEMP stub login.
// Looks the user up in Mongo by username and uses the real _id as JWT.sub.
// Until Aadithya lands real bcrypt+register, no password is required —
// any seeded username logs in. The point of this stub is that the rest
// of the system (chat membership checks, message authorship, DM keying)
// gets a real, consistent user ID rather than a username string.
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }

    const user = await db().collection('users').findOne(
      { username },
      { projection: { _id: 1, username: 1 } }
    );

    if (!user) {
      return res.status(401).json({ error: 'unknown user' });
    }

    // JWT.sub gets the real Mongo _id (and Neo4j User.id, since they match).
    const token = signToken({ id: user._id, username: user.username });

    await sessionService.createSession(token, user._id);

    res.json({ token, userId: user._id, username: user.username });
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/logout', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'no token' });

  const token = header.split(' ')[1];
  await sessionService.destroySession(token);

  res.json({ ok: true });
});

module.exports = router;

// server/src/routes/auth.routes.js
//
// Real authentication: register + login + logout.
// Replaces the stub from earlier phases.
//
// Register flow:
//   1. Validate input
//   2. Check username + email uniqueness in Mongo
//   3. Hash password with bcrypt
//   4. Insert user into Mongo (with skill_names empty array, no skills yet)
//   5. Create matching User node in Neo4j via graph-sync
//   6. Sign JWT, store session, return token
//
// Login flow:
//   1. Look up user by username
//   2. Compare password via bcrypt
//   3. Sign JWT, store session, return token

const express = require('express');
const auth = require('../services/auth.service');
const sessionService = require('../services/session.service');
const graphSync = require('../services/graph-sync.service');
const { db } = require('../db/mongo');

const router = express.Router();

// Generate a stable string _id for new users following the existing
// fixture pattern: "65" + zero-padded random integer to 24 chars total.
// Using strings (not ObjectId) keeps Neo4j and Mongo identifiers
// trivially interchangeable.
function generateUserId() {
  const random = Math.floor(Math.random() * 1e15)
    .toString()
    .padStart(22, '0');
  return '65' + random;
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role, bio } = req.body || {};

    // Validation
    const errors = auth.validateRegisterInput({ username, email, password, role });
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', fields: errors });
    }

    const usernameLower = username.trim().toLowerCase();
    const emailLower = email.trim().toLowerCase();

    // Uniqueness — explicit check gives a friendlier error than a
    // raw Mongo E11000 duplicate-key error.
    const existing = await db().collection('users').findOne({
      $or: [{ username: usernameLower }, { email: emailLower }],
    });
    if (existing) {
      const field = existing.username === usernameLower ? 'username' : 'email';
      return res.status(409).json({
        error: `That ${field} is already taken.`,
        field,
      });
    }

    // Hash + insert
    const password_hash = await auth.hashPassword(password);
    const _id = generateUserId();

    const userDoc = {
      _id,
      username: usernameLower,
      email: emailLower,
      password_hash,
      role: role || '',
      bio: bio || '',
      skills: [],
      skill_names: [],
      created_at: new Date(),
    };

    await db().collection('users').insertOne(userDoc);

    // Mirror to Neo4j so the user shows up in match traversal etc.
    try {
      await graphSync.syncUser({ _id, username: usernameLower });
    } catch (err) {
      // If Neo4j sync fails, the Mongo doc still exists — we log but
      // don't roll back. graph-sync is idempotent so a later seed/sync
      // can recover the missing edge.
      console.error('graph-sync.syncUser failed during register:', err.message);
    }

    // Issue session
    const token = auth.signToken({ id: _id, username: usernameLower });
    await sessionService.createSession(token, _id);

    res.status(201).json({ token, userId: _id, username: usernameLower });
  } catch (err) {
    console.error('register failed:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    const user = await db().collection('users').findOne(
      { username: username.trim().toLowerCase() },
      { projection: { _id: 1, username: 1, password_hash: 1 } }
    );

    // Same generic error for unknown user vs wrong password —
    // never reveal which one to a probing attacker.
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Backwards-compat: seeded users without a password_hash get the
    // demo password; this lets the existing fixture flow keep working
    // until the seed bakes hashes in. After re-seeding everyone has
    // a hash; this branch is dead code that we leave for safety.
    if (!user.password_hash) {
      console.warn(`User ${user.username} has no password_hash — re-seed Mongo to apply demo password`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const ok = await auth.verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = auth.signToken({ id: user._id, username: user.username });
    await sessionService.createSession(token, user._id);

    res.json({ token, userId: user._id, username: user.username });
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/logout', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = header.split(' ')[1];
  await sessionService.destroySession(token);

  res.json({ ok: true });
});

module.exports = router;

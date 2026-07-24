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
const oauth = require('../services/oauth.service');
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
    const { username, email, password, role, bio, account_type, org_name, website } = req.body || {};
    const isOrg = account_type === 'organization';

    const errors = auth.validateRegisterInput({
      username,
      email,
      password,
      role,
      account_type: account_type || 'individual',
      org_name,
    });
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', fields: errors });
    }

    const emailLower = email.trim().toLowerCase();
    let usernameLower;
    let orgSlug = null;

    if (isOrg) {
      const name = org_name.trim();
      orgSlug = auth.slugify(name);
      if (!orgSlug || orgSlug.length < 2) {
        return res.status(400).json({
          error: 'Validation failed',
          fields: { org_name: 'Organization name must yield a valid slug.' },
        });
      }
      usernameLower = (username && username.trim().toLowerCase())
        || orgSlug.replace(/-/g, '_').slice(0, 30);
      if (usernameLower.length < 3) usernameLower = `org_${usernameLower}`.slice(0, 30);
    } else {
      usernameLower = username.trim().toLowerCase();
    }

    const orQuery = [{ username: usernameLower }, { email: emailLower }];
    if (orgSlug) orQuery.push({ org_slug: orgSlug });

    const existing = await db().collection('users').findOne({ $or: orQuery });
    if (existing) {
      let field = 'email';
      if (existing.username === usernameLower) field = 'username';
      else if (existing.org_slug === orgSlug) field = 'org_name';
      return res.status(409).json({
        error: `That ${field === 'org_name' ? 'organization name' : field} is already taken.`,
        field,
      });
    }

    const password_hash = await auth.hashPassword(password);
    const _id = generateUserId();

    const userDoc = {
      _id,
      username: usernameLower,
      email: emailLower,
      password_hash,
      role: isOrg ? (role || 'Organization') : (role || ''),
      bio: bio || '',
      skills: [],
      skill_names: [],
      auth_providers: [],
      account_type: isOrg ? 'organization' : 'individual',
      profile_visibility: {
        show_current_teams: true,
        show_past_projects: true,
      },
      created_at: new Date(),
    };

    if (isOrg) {
      userDoc.org_name = org_name.trim();
      userDoc.org_slug = orgSlug;
      userDoc.website = typeof website === 'string' ? website.trim() : '';
    }

    await db().collection('users').insertOne(userDoc);

    try {
      await graphSync.syncUser({ _id, username: usernameLower });
    } catch (err) {
      console.error('graph-sync.syncUser failed during register:', err.message);
    }

    const token = auth.signToken({ id: _id, username: usernameLower });
    await sessionService.createSession(token, _id);

    res.status(201).json({
      token,
      userId: _id,
      username: usernameLower,
      account_type: userDoc.account_type,
    });
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

    // SSO-only accounts have no password_hash — direct them to OAuth.
    if (!user.password_hash) {
      return res.status(401).json({
        error: 'This account uses Google or GitHub sign-in. Use the SSO buttons instead.',
      });
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

    res.json({
      token,
      userId: user._id,
      username: user.username,
      account_type: user.account_type || 'individual',
    });
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

// --- OAuth (Google / GitHub) ---

router.get('/providers', (req, res) => {
  res.json({
    google: oauth.isConfigured('google'),
    github: oauth.isConfigured('github'),
  });
});

router.get('/google', async (req, res) => {
  try {
    if (!oauth.isConfigured('google')) {
      return res.status(503).json({ error: 'Google OAuth is not configured' });
    }
    const state = await oauth.createState('google');
    res.redirect(oauth.authUrl('google', state));
  } catch (err) {
    console.error('GET /auth/google failed:', err);
    res.status(500).json({ error: 'OAuth start failed' });
  }
});

router.get('/github', async (req, res) => {
  try {
    if (!oauth.isConfigured('github')) {
      return res.status(503).json({ error: 'GitHub OAuth is not configured' });
    }
    const state = await oauth.createState('github');
    res.redirect(oauth.authUrl('github', state));
  } catch (err) {
    console.error('GET /auth/github failed:', err);
    res.status(500).json({ error: 'OAuth start failed' });
  }
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(oauth.errorRedirect(String(error)));
    const provider = await oauth.consumeState(state);
    if (provider !== 'google') {
      return res.redirect(oauth.errorRedirect('Invalid OAuth state'));
    }
    if (!code) return res.redirect(oauth.errorRedirect('Missing authorization code'));
    const identity = await oauth.exchangeGoogle(String(code));
    const session = await oauth.completeOAuthLogin(identity);
    res.redirect(oauth.successRedirect(session));
  } catch (err) {
    console.error('GET /auth/google/callback failed:', err);
    res.redirect(oauth.errorRedirect(err.message || 'Google sign-in failed'));
  }
});

router.get('/github/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(oauth.errorRedirect(String(error)));
    const provider = await oauth.consumeState(state);
    if (provider !== 'github') {
      return res.redirect(oauth.errorRedirect('Invalid OAuth state'));
    }
    if (!code) return res.redirect(oauth.errorRedirect('Missing authorization code'));
    const identity = await oauth.exchangeGithub(String(code));
    const session = await oauth.completeOAuthLogin(identity);
    res.redirect(oauth.successRedirect(session));
  } catch (err) {
    console.error('GET /auth/github/callback failed:', err);
    res.redirect(oauth.errorRedirect(err.message || 'GitHub sign-in failed'));
  }
});

module.exports = router;

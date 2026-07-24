// server/src/services/oauth.service.js
//
// Manual OAuth Authorization Code flow for Google and GitHub.
// Issues the same JWT + Redis session as password login after upsert.

const crypto = require('crypto');
const { client } = require('../db/redis');
const { db } = require('../db/mongo');
const auth = require('./auth.service');
const sessionService = require('./session.service');
const graphSync = require('./graph-sync.service');

const DEFAULT_VISIBILITY = {
  show_current_teams: true,
  show_past_projects: true,
};

const STATE_TTL = 600; // 10 minutes

function callbackBase() {
  return (process.env.OAUTH_CALLBACK_BASE_URL || 'http://localhost:8080/api').replace(/\/$/, '');
}

function clientOrigin() {
  return (process.env.CLIENT_ORIGIN || 'http://localhost:8080').replace(/\/$/, '');
}

function isConfigured(provider) {
  if (provider === 'google') {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }
  if (provider === 'github') {
    return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  }
  return false;
}

async function createState(provider) {
  const state = crypto.randomBytes(24).toString('hex');
  await client.set(`oauth:state:${state}`, provider, { EX: STATE_TTL });
  return state;
}

async function consumeState(state) {
  const key = `oauth:state:${state}`;
  const provider = await client.get(key);
  if (provider) await client.del(key);
  return provider;
}

function authUrl(provider, state) {
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: `${callbackBase()}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  if (provider === 'github') {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: `${callbackBase()}/auth/github/callback`,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }
  throw new Error(`Unknown provider: ${provider}`);
}

function generateUserId() {
  const random = Math.floor(Math.random() * 1e15)
    .toString()
    .padStart(22, '0');
  return '65' + random;
}

async function uniqueUsername(base) {
  let cleaned = String(base || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (cleaned.length < 3) cleaned = `user_${cleaned || 'x'}`;
  cleaned = cleaned.slice(0, 24);

  let candidate = cleaned;
  let n = 0;
  while (await db().collection('users').findOne({ username: candidate }, { projection: { _id: 1 } })) {
    n += 1;
    candidate = `${cleaned.slice(0, 24 - String(n).length)}_${n}`;
  }
  return candidate;
}

async function exchangeGoogle(code) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${callbackBase()}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  const tokens = await tokenRes.json();

  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error('Failed to fetch Google profile');
  }
  const profile = await profileRes.json();
  if (!profile.email) {
    throw new Error('Google account did not return an email');
  }
  return {
    provider: 'google',
    provider_id: String(profile.sub),
    email: profile.email.toLowerCase(),
    usernameHint: (profile.email.split('@')[0] || profile.name || 'google_user'),
  };
}

async function exchangeGithub(code) {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${callbackBase()}/auth/github/callback`,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error('GitHub token exchange failed');
  }
  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    throw new Error(tokens.error_description || 'GitHub did not return an access token');
  }

  const profileRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'SynergyHack',
    },
  });
  if (!profileRes.ok) {
    throw new Error('Failed to fetch GitHub profile');
  }
  const profile = await profileRes.json();

  let email = profile.email ? profile.email.toLowerCase() : null;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SynergyHack',
      },
    });
    if (emailsRes.ok) {
      const emails = await emailsRes.json();
      const primary = emails.find(e => e.primary && e.verified) || emails.find(e => e.verified);
      if (primary) email = primary.email.toLowerCase();
    }
  }
  if (!email) {
    throw new Error('GitHub account did not return a verified email');
  }

  return {
    provider: 'github',
    provider_id: String(profile.id),
    email,
    usernameHint: profile.login || email.split('@')[0] || 'github_user',
  };
}

async function upsertOAuthUser(identity) {
  const { provider, provider_id, email, usernameHint } = identity;

  let user = await db().collection('users').findOne({
    auth_providers: { $elemMatch: { provider, provider_id } },
  });

  if (!user) {
    user = await db().collection('users').findOne({ email });
  }

  if (user) {
    const providers = user.auth_providers || [];
    const already = providers.some(p => p.provider === provider && p.provider_id === provider_id);
    if (!already) {
      await db().collection('users').updateOne(
        { _id: user._id },
        {
          $push: {
            auth_providers: { provider, provider_id, linked_at: new Date() },
          },
        }
      );
    }
    return user;
  }

  const username = await uniqueUsername(usernameHint);
  const _id = generateUserId();
  const userDoc = {
    _id,
    username,
    email,
    password_hash: null,
    role: '',
    bio: '',
    skills: [],
    skill_names: [],
    account_type: 'individual',
    auth_providers: [{ provider, provider_id, linked_at: new Date() }],
    profile_visibility: { ...DEFAULT_VISIBILITY },
    created_at: new Date(),
  };

  await db().collection('users').insertOne(userDoc);

  try {
    await graphSync.syncUser({ _id, username });
  } catch (err) {
    console.error('graph-sync.syncUser failed during OAuth signup:', err.message);
  }

  return userDoc;
}

async function completeOAuthLogin(identity) {
  const user = await upsertOAuthUser(identity);
  const token = auth.signToken({ id: user._id, username: user.username });
  await sessionService.createSession(token, user._id);
  return { token, userId: user._id, username: user.username };
}

function successRedirect({ token, userId, username }) {
  const params = new URLSearchParams({
    token,
    userId,
    username,
  });
  // Hash fragment keeps the JWT out of server access logs / Referer.
  return `${clientOrigin()}/auth/callback#${params}`;
}

function errorRedirect(message) {
  const params = new URLSearchParams({ error: message });
  return `${clientOrigin()}/auth/callback#${params}`;
}

module.exports = {
  isConfigured,
  createState,
  consumeState,
  authUrl,
  exchangeGoogle,
  exchangeGithub,
  completeOAuthLogin,
  successRedirect,
  errorRedirect,
};

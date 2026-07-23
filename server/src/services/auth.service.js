// server/src/services/auth.service.js
//
// Authentication primitives:
//   - JWT sign/verify (expiry from JWT_EXPIRES_IN, HS256, secret from env)
//   - Password hashing via bcryptjs (10 salt rounds)
//   - Username + email + password validation
//
// Secret/expiry are read at call time (not module load) so Docker
// Compose / dotenv env is always what sign/verify use.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

function getSecret() {
  return process.env.JWT_SECRET || 'dev_secret';
}

function getExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '24h';
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    getSecret(),
    { expiresIn: getExpiresIn() }
  );
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

async function verifyPassword(plaintext, storedHash) {
  if (!plaintext || !storedHash) return false;
  return bcrypt.compare(plaintext, storedHash);
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function validateRegisterInput({ username, email, password, role, account_type, org_name }) {
  const errors = {};
  const isOrg = account_type === 'organization';

  if (isOrg) {
    if (!org_name || !String(org_name).trim()) {
      errors.org_name = 'Organization name is required.';
    }
    // Username optional for orgs — derived from org_name if missing
    if (username && !USERNAME_RE.test(username)) {
      errors.username = 'Username must be 3–30 chars: letters, digits, or underscores.';
    }
  } else if (!username || !USERNAME_RE.test(username)) {
    errors.username = 'Username must be 3–30 chars: letters, digits, or underscores.';
  }

  if (!email || !EMAIL_RE.test(email)) {
    errors.email = 'Email must look like name@example.com.';
  }
  if (!password || password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  if (role !== undefined && role !== null && role !== '' && typeof role !== 'string') {
    errors.role = 'Role must be a string.';
  }
  if (account_type && account_type !== 'individual' && account_type !== 'organization') {
    errors.account_type = 'account_type must be individual or organization.';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

module.exports = {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  validateRegisterInput,
  USERNAME_RE,
  SLUG_RE,
  slugify,
};

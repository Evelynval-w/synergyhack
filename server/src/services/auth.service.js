// server/src/services/auth.service.js
//
// Authentication primitives:
//   - JWT sign/verify (24h expiry, HS256, secret from env)
//   - Password hashing via bcryptjs (10 salt rounds)
//   - Username + email + password validation
//
// We use bcryptjs (pure JS) rather than native bcrypt to avoid
// node-gyp build failures across architectures. Slightly slower
// hashing than the C binding, but trivially fast at hackathon scale
// and zero install friction.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET || 'dev_secret';
const SALT_ROUNDS = 10;

// --- JWT ---

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    SECRET,
    { expiresIn: '24h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// --- Password hashing ---

/**
 * Hashes a plaintext password with bcrypt + 10 salt rounds.
 * Returns the full hash string ($2b$10$...) which contains both
 * the salt and the hash; storing this in user.password_hash is
 * sufficient for later verification.
 */
async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Constant-time comparison via bcrypt — never use === on hashes.
 */
async function verifyPassword(plaintext, storedHash) {
  if (!plaintext || !storedHash) return false;
  return bcrypt.compare(plaintext, storedHash);
}

// --- Validation ---

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegisterInput({ username, email, password, role }) {
  const errors = {};

  if (!username || !USERNAME_RE.test(username)) {
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

  return Object.keys(errors).length > 0 ? errors : null;
}

module.exports = {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  validateRegisterInput,
};

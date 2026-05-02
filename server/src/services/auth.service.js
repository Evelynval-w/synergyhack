const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userService = require('./user.service');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = 10;

/**
 * Registers a new user. Throws if username or email already exists.
 */
async function register({ username, email, password, bio = '' }) {
  if (!username || !email || !password) {
    throw new Error('Missing required fields');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const existing = await userService.getUserByUsername(username);
  if (existing) {
    throw new Error('Username already taken');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  console.log('DEBUG hash:', passwordHash);
  const user = await userService.createUser({
    username,
    email,
    passwordHash,
    bio
  });

  const token = signToken(user._id ? user._id.toString() : '', user.username);

  delete user.passwordHash;
  return { user, token };
}

/**
 * Validates credentials and returns a token.
 */
async function login({ username, password }) {
  const user = await userService.getUserByUsername(username);
  if (!user) throw new Error('Invalid credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error('Invalid credentials');

  const token = signToken(user._id.toString(), user.username);

  delete user.passwordHash;
  return { user, token };
}

function signToken(userId, username) {
  return jwt.sign(
    { sub: userId, username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { register, login, verifyToken };
// TEMPORARY — Chris's stub for testing the JWT/session flow.
// Aadithya will replace this with the real register/login that uses
// bcrypt + Mongo when she pushes her auth-and-users PR.
// Until then, this file lets us test the rest of the Redis flow.

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev_secret';

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

module.exports = { signToken, verifyToken };

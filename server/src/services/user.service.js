const { ObjectId } = require('mongodb');
const { db } = require('../db/mongo');
 
const COL = 'users';
 
/**
 * Creates a new user. Caller is responsible for hashing the password
 * before passing it in.
 */
async function createUser({ username, email, passwordHash, bio = '' }) {
  const doc = {
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    passwordHash,
    bio,
    role: null,
    avatar: null,
    createdAt: new Date(),
  };
  const result = await db().collection(COL).insertOne(doc);
  return { ...doc, _id: result.insertedId };;
}
 
/**
 * Finds a user by their MongoDB ObjectId.
 */
async function getUserById(id) {
  if (!ObjectId.isValid(id)) return null;
  return db().collection(COL).findOne(
    { _id: new ObjectId(id) },
    { projection: { passwordHash: 0 } }   // never return the hash
  );
}
 
/**
 * Finds a user by username — used for login.
 * Returns the full document including passwordHash.
 */
async function getUserByUsername(username) {
  return db().collection(COL).findOne({ username: username.toLowerCase() });
}
 
/**
 * Updates a user's profile fields. Only allows certain fields to be changed
 * (so a malicious caller can't promote themselves to admin or change their hash).
 */
async function updateUser(id, updates) {
  if (!ObjectId.isValid(id)) return null;
  const allowed = {};
  if (typeof updates.bio === 'string') allowed.bio = updates.bio;
  if (typeof updates.avatar === 'string') allowed.avatar = updates.avatar;
  if (typeof updates.role === 'string') allowed.role = updates.role;
 
  if (Object.keys(allowed).length === 0) return null;
 
  await db().collection(COL).updateOne(
    { _id: new ObjectId(id) },
    { $set: allowed }
  );
  return getUserById(id);
}
 
module.exports = {
  createUser,
  getUserById,
  getUserByUsername,
  updateUser,
};

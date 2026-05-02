// server/src/services/user.service.js

const { ObjectId } = require('mongodb');
const { db } = require('../db/mongo');

const COL = 'users';

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
  const fullDoc = { _id: result.insertedId, ...doc };

  try {
    const graphSync = require('./graph-sync.service');
    await graphSync.syncUser(fullDoc);
  } catch (err) {
    console.warn('Graph sync failed for user', result.insertedId, err.message);
  }

  return fullDoc;
}

async function getUserById(id) {
  if (!ObjectId.isValid(id)) return null;
  return db().collection(COL).findOne(
    { _id: new ObjectId(id) },
    { projection: { passwordHash: 0 } }
  );
}

async function getUserByUsername(username) {
  return db().collection(COL).findOne({ username: username.toLowerCase() });
}

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

async function searchUsers(query) {
  if (!query || query.trim().length === 0) return [];
  return db().collection(COL)
    .find(
      { $text: { $search: query } },
      { projection: { passwordHash: 0, score: { $meta: 'textScore' } } }
    )
    .sort({ score: { $meta: 'textScore' } })
    .limit(20)
    .toArray();
}

module.exports = { createUser, getUserById, getUserByUsername, updateUser, searchUsers };
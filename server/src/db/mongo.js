// server/src/db/mongo.js

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB || 'synergyhack';

if (!URI) {
  throw new Error('MONGO_URI not set. Check your .env file at the repo root.');
}

const client = new MongoClient(URI, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 10000,
});

let _db = null;

async function connect() {
  if (!_db) {
    await client.connect();
    _db = client.db(DB_NAME);
  }
  return _db;
}

function db() {
  if (!_db) {
    throw new Error('MongoDB not connected. Call connect() first.');
  }
  return _db;
}

async function verifyConnection() {
  const d = await connect();
  await d.admin().ping();
  return true;
}

async function ensureIndexes() {
  const d = await connect();
  await d.collection('users').createIndex(
    { bio: 'text', username: 'text' },
    { name: 'users_text_search', default_language: 'english' }
  );
  await d.collection('users').createIndex({ username: 1 }, { unique: true });
  await d.collection('users').createIndex({ email: 1 }, { unique: true });
  await d.collection('hackathons').createIndex({ startDate: 1 });
}

async function close() {
  await client.close();
  _db = null;
}

module.exports = { connect, db, verifyConnection, close, ensureIndexes, client };
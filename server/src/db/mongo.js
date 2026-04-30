// server/src/db/mongo.js
// MongoDB connector — owned by Aadithya

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

async function connect() {
  if (!db) {
    await client.connect();
    db = client.db('synergyhack');
    console.log('Connected to MongoDB');
  }
  return db;
}

async function getDb() {
  if (!db) await connect();
  return db;
}

async function verifyConnection() {
  try {
    const database = await getDb();
    await database.command({ ping: 1 });
    return true;
  } catch (err) {
    console.error('MongoDB ping failed:', err);
    return false;
  }
}

module.exports = { connect, getDb, verifyConnection };
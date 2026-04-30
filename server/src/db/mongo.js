// server/src/db/mongo.js
// MongoDB connector + collection indexes — owned by Aadithya

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

async function connect() {
  if (!db) {
    await client.connect();
    db = client.db('synergyhack');
    await createIndexes();
    console.log('Connected to MongoDB');
  }
  return db;
}

async function createIndexes() {
  // users
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('users').createIndex({ email: 1 }, { unique: true });

  // teams
  await db.collection('teams').createIndex({ hackathonId: 1 });
  await db.collection('teams').createIndex({ createdBy: 1 });

  // hackathons
  await db.collection('hackathons').createIndex({ name: 1 });
  await db.collection('hackathons').createIndex({ startDate: 1 });

  // past_projects — text search index
  await db.collection('past_projects').createIndex(
    { title: 'text', description: 'text', skills_used: 'text' },
    { name: 'project_text_search' }
  );
  await db.collection('past_projects').createIndex({ hackathonId: 1 });

  console.log('MongoDB indexes created');
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
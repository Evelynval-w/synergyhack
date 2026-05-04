// scripts/seed-mongo.js
//
// Seeds MongoDB with the 4 core collections (users, teams, hackathons,
// past_projects) from the JSON fixtures, then creates all indexes the
// app and rubric require.
//
// Run with: node scripts/seed-mongo.js
// Idempotent: drops each collection before inserting.

require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env'),
});

const fs = require('fs');
const path = require('path');
const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));
const mongo = require('../server/src/db/mongo');

const DEMO_PASSWORD = 'password123';

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
  );
}

function prepareUser(user, demoHash) {
  const skill_names = (user.skills || []).map(s => s.name);
  return {
    ...user,
    skill_names,
    password_hash: demoHash,
  };
}

async function dropAndInsert(db, collectionName, docs) {
  const col = db.collection(collectionName);
  await col.deleteMany({});
  if (docs.length > 0) {
    await col.insertMany(docs, { ordered: true });
  }
  console.log(`  ${collectionName}: inserted ${docs.length}`);
}

async function createIndexes(db) {
  // --- users ---
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('users').createIndex({ email: 1 }, { unique: true });

  // Compound text index for bio search (Phase 5).
  await db.collection('users').createIndex(
    { skill_names: 'text', role: 'text', bio: 'text' },
    {
      weights: { skill_names: 10, role: 5, bio: 3 },
      name: 'user_search_idx',
    }
  );

  // --- teams ---
  await db.collection('teams').createIndex({ hackathonId: 1 });
  await db.collection('teams').createIndex({ members: 1 });

  // Text index for team search (Phase 13). Name weighted higher than
  // description so 'climate' surfaces ClimateStack above teams that
  // merely mention climate in their description.
  await db.collection('teams').createIndex(
    { name: 'text', description: 'text' },
    {
      weights: { name: 10, description: 3 },
      name: 'team_search_idx',
    }
  );

  // --- hackathons ---
  await db.collection('hackathons').createIndex({ startDate: 1 });

  // --- past_projects ---
  await db.collection('past_projects').createIndex({ rating: -1 });
  await db.collection('past_projects').createIndex({ hackathonId: 1 });

  // --- messages (Phase 6 chat mirror) ---
  await db.collection('messages').createIndex({ channel: 1, ts: 1 });

  console.log('  10 indexes created across 5 collections');
}

async function run() {
  console.log('Connecting to MongoDB...');
  const db = await mongo.connect();
  console.log(`  connected to db: ${db.databaseName}`);

  console.log(`Hashing demo password (this takes ~half a second)...`);
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  console.log('Seeding collections...');
  const rawUsers = loadFixture('users.json');
  const users = rawUsers.map(u => prepareUser(u, demoHash));
  const teams = loadFixture('teams.json');
  const hackathons = loadFixture('hackathons.json');
  const pastProjects = loadFixture('past_projects.json');

  await dropAndInsert(db, 'users', users);
  await dropAndInsert(db, 'teams', teams);
  await dropAndInsert(db, 'hackathons', hackathons);
  await dropAndInsert(db, 'past_projects', pastProjects);

  await db.collection('messages').deleteMany({});
  console.log('  messages: wiped');

  console.log('Creating indexes...');
  await createIndexes(db);

  console.log(`\nDemo accounts now sign in with password: ${DEMO_PASSWORD}`);
  console.log('Done.');
  await mongo.close();
}

run().catch(err => {
  console.error('Mongo seed failed:', err);
  process.exit(1);
});

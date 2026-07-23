// scripts/seed-mongo.js
//
// Seeds MongoDB with core collections from JSON fixtures, then creates indexes.
// Run with: node scripts/seed-mongo.js
// Idempotent: drops each collection before inserting.

require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env'),
});

const fs = require('fs');
const path = require('path');
const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));
const mongo = require('../server/src/db/mongo');
const { ensureIndexes } = require('../server/src/db/ensureIndexes');

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
    auth_providers: [],
    account_type: user.account_type || 'individual',
    profile_visibility: {
      show_current_teams: true,
      show_past_projects: true,
    },
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

async function run() {
  console.log('Connecting to MongoDB...');
  const db = await mongo.connect();
  console.log(`  connected to db: ${db.databaseName}`);

  console.log(`Hashing demo password (this takes ~half a second)...`);
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  console.log('Seeding collections...');
  const rawUsers = loadFixture('users.json');
  const rawOrgs = loadFixture('orgs.json');
  const users = [
    ...rawUsers.map(u => prepareUser(u, demoHash)),
    ...rawOrgs.map(u => prepareUser(u, demoHash)),
  ];
  const teams = loadFixture('teams.json');
  const hackathons = loadFixture('hackathons.json');
  const pastProjects = loadFixture('past_projects.json');

  await dropAndInsert(db, 'users', users);
  await dropAndInsert(db, 'teams', teams);
  await dropAndInsert(db, 'hackathons', hackathons);
  await dropAndInsert(db, 'past_projects', pastProjects);

  await db.collection('messages').deleteMany({});
  console.log('  messages: wiped');

  await db.collection('team_requests').deleteMany({});
  console.log('  team_requests: wiped');

  await db.collection('notifications').deleteMany({});
  console.log('  notifications: wiped');

  await db.collection('event_registrations').deleteMany({});
  console.log('  event_registrations: wiped');

  await db.collection('leaderboard_entries').deleteMany({});
  console.log('  leaderboard_entries: wiped');

  // Extra indexes that ensureIndexes does not cover (teams text, messages, etc.)
  await db.collection('teams').createIndex({ hackathonId: 1 });
  await db.collection('teams').createIndex({ members: 1 });
  try {
    await db.collection('teams').dropIndex('team_search_idx');
  } catch { /* ok */ }
  await db.collection('teams').createIndex(
    { name: 'text', description: 'text' },
    { weights: { name: 10, description: 3 }, name: 'team_search_idx' }
  );
  await db.collection('past_projects').createIndex({ rating: -1 });
  await db.collection('past_projects').createIndex({ hackathonId: 1 });
  await db.collection('messages').createIndex({ channel: 1, ts: 1 });
  await db.collection('team_requests').createIndex({ teamId: 1, status: 1 });
  await db.collection('team_requests').createIndex({ userId: 1, createdAt: -1 });

  console.log('Creating indexes...');
  await ensureIndexes();

  console.log(`\nDemo accounts now sign in with password: ${DEMO_PASSWORD}`);
  console.log('Org demo account: synergy_org');
  console.log('Done.');
  await mongo.close();
}

run().catch(err => {
  console.error('Mongo seed failed:', err);
  process.exit(1);
});

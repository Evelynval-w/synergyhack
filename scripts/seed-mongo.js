// scripts/seed-mongo.js
//
// Seeds MongoDB with the 4 core collections (users, teams, hackathons,
// past_projects) from the JSON fixtures, then creates all indexes the
// app and rubric require.
//
// Run with: node scripts/seed-mongo.js
// Idempotent: drops each collection before inserting.
//
// The script also flattens user.skills (array of objects) into a parallel
// `skill_names` (array of strings) so the compound text index can include
// skill names — Mongo's text index can't directly index an array of objects.

require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env'),
});

const fs = require('fs');
const path = require('path');
const mongo = require('../server/src/db/mongo');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
  );
}

/**
 * Flattens skills:[{name,...}] -> skill_names:[name,...] alongside the
 * original. Keeps full skills shape for hydration; adds the flat field
 * so the text index can pick up skill names.
 */
function withFlattenedSkillNames(user) {
  const skill_names = (user.skills || []).map(s => s.name);
  return { ...user, skill_names };
}

async function dropAndInsert(db, collectionName, docs) {
  const col = db.collection(collectionName);
  // drop() throws if the collection doesn't exist; deleteMany works either way
  await col.deleteMany({});
  if (docs.length > 0) {
    await col.insertMany(docs, { ordered: true });
  }
  console.log(`  ${collectionName}: inserted ${docs.length}`);
}

async function createIndexes(db) {
  // --- users ---
  // Unique constraints for login + future register flow
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('users').createIndex({ email: 1 }, { unique: true });

  // Compound text index for bio search (Phase 5).
  // Weights bias the score: a hit on a skill name matters more than
  // the same word appearing in someone's bio.
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

  // --- hackathons ---
  await db.collection('hackathons').createIndex({ startDate: 1 });

  // --- past_projects ---
  await db.collection('past_projects').createIndex({ rating: -1 });
  await db.collection('past_projects').createIndex({ hackathonId: 1 });

  // --- messages ---
  // Phase 6: chat mirror. Compound (channel, ts) supports the most
  // common query pattern: "messages for channel X ordered by time".
  await db.collection('messages').createIndex({ channel: 1, ts: 1 });

  console.log('  9 indexes created across 5 collections');
}

async function run() {
  console.log('Connecting to MongoDB...');
  const db = await mongo.connect();
  console.log(`  connected to db: ${db.databaseName}`);

  console.log('Seeding collections...');
  const users = loadFixture('users.json').map(withFlattenedSkillNames);
  const teams = loadFixture('teams.json');
  const hackathons = loadFixture('hackathons.json');
  const pastProjects = loadFixture('past_projects.json');

  await dropAndInsert(db, 'users', users);
  await dropAndInsert(db, 'teams', teams);
  await dropAndInsert(db, 'hackathons', hackathons);
  await dropAndInsert(db, 'past_projects', pastProjects);

  // Wipe the messages collection too — fresh demo state.
  await db.collection('messages').deleteMany({});
  console.log('  messages: wiped');

  console.log('Creating indexes...');
  await createIndexes(db);

  console.log('Done.');
  await mongo.close();
}

run().catch(err => {
  console.error('Mongo seed failed:', err);
  process.exit(1);
});

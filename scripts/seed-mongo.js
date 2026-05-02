// scripts/seed-mongo.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const mongo = require('../server/src/db/mongo');
const { ObjectId } = require('mongodb');

async function run() {
  await mongo.connect();
  await mongo.ensureIndexes();
  const db = mongo.db();

  console.log('Dropping existing collections...');
  for (const col of ['users', 'teams', 'hackathons', 'past_projects']) {
    try { await db.collection(col).drop(); } catch (e) { /* didn't exist */ }
  }
  await mongo.ensureIndexes();

  const fixtures = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'mongo-data.json'), 'utf8'
  ));

  const hash = await bcrypt.hash('demo123', 10);
  const usersWithIds = fixtures.users.map(u => ({
    ...u,
    _id: new ObjectId(u._id),
    passwordHash: hash,
    createdAt: new Date(u.createdAt || Date.now()),
  }));

  console.log(`Inserting ${usersWithIds.length} users...`);
  await db.collection('users').insertMany(usersWithIds);

  console.log(`Inserting ${fixtures.hackathons.length} hackathons...`);
  await db.collection('hackathons').insertMany(fixtures.hackathons.map(h => ({
    ...h,
    _id: new ObjectId(h._id),
    startDate: new Date(h.startDate),
    endDate: new Date(h.endDate),
  })));

  console.log(`Inserting ${fixtures.teams.length} teams...`);
  await db.collection('teams').insertMany(fixtures.teams.map(t => ({
    ...t,
    _id: new ObjectId(t._id),
    hackathonId: new ObjectId(t.hackathonId),
    createdBy: new ObjectId(t.createdBy),
    createdAt: new Date(t.createdAt || Date.now()),
  })));

  console.log(`Inserting ${fixtures.past_projects.length} past projects...`);
  await db.collection('past_projects').insertMany(fixtures.past_projects.map(p => ({
    ...p,
    _id: new ObjectId(p._id),
    members: p.members.map(m => ({ ...m, userId: new ObjectId(m.userId) })),
    completedAt: new Date(p.completedAt),
  })));

  console.log('Done.');
  await mongo.close();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
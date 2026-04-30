
// scripts/seed-neo4j.js
//
// Seeds the Neo4j graph: schema + skills + complements + users + teams
// + hackathons + memberships + past teamed-with edges.
//
// Run with: node scripts/seed-neo4j.js
// Idempotent via MERGE.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { session, verifyConnection, close } = require('../server/src/db/neo4j');
const skillService = require('../server/src/services/skill.service');
const graphSync = require('../server/src/services/graph-sync.service');

async function applySchema() {
  const schemaPath = path.join(__dirname, '..', 'server', 'src', 'db', 'neo4j.schema.cypher');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('//'));

  const s = session();
  try {
    for (const stmt of statements) await s.run(stmt);
  } finally {
    await s.close();
  }
  console.log(`  applied ${statements.length} schema statements`);
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', name), 'utf8'
  ));
}

async function run() {
  console.log('Connecting to Neo4j...');
  await verifyConnection();

  console.log('Applying schema...');
  await applySchema();

  console.log('Seeding skills catalogue...');
  const skillCount = await skillService.seedSkills();
  console.log(`  inserted ${skillCount} skills`);

  console.log('Seeding COMPLEMENTS edges...');
  const compCount = await skillService.seedComplements();
  console.log(`  inserted ${compCount} edges`);

  console.log('Seeding users + their skills...');
  const users = loadFixture('users.json');
  for (const u of users) {
    await graphSync.syncUser({ _id: u._id, username: u.username });
    for (const sk of u.skills || []) {
      await skillService.addUserSkill(u._id, sk.name, sk.level, sk.years);
    }
  }
  console.log(`  seeded ${users.length} users`);

  console.log('Seeding hackathons...');
  const hackathons = loadFixture('hackathons.json');
  const s = session();
  try {
    for (const h of hackathons) {
      await s.run(
        `MERGE (h:Hackathon {id: $id}) SET h.name = $name`,
        { id: h._id, name: h.name }
      );
    }
  } finally {
    await s.close();
  }
  console.log(`  seeded ${hackathons.length} hackathons`);

  console.log('Seeding teams + memberships...');
  const teams = loadFixture('teams.json');
  for (const t of teams) {
    await graphSync.syncTeam({
      _id: t._id,
      name: t.name,
      hackathonId: t.hackathonId,
    });
    for (const memberId of t.members || []) {
      await graphSync.joinTeam(memberId, t._id);
    }
  }
  console.log(`  seeded ${teams.length} teams`);

  console.log('Seeding past-collaboration edges...');
  const projects = loadFixture('past_projects.json');
  let edgeCount = 0;
  for (const p of projects) {
    const members = (p.members || []).map(m => m.userId || m._id);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        await graphSync.recordTeamedWith(members[i], members[j], p.rating, p._id);
        edgeCount++;
      }
    }
  }
  console.log(`  seeded ${edgeCount} TEAMED_WITH edges`);

  console.log('Done.');
  await close();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

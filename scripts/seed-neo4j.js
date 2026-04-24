// scripts/seed-neo4j.js
//
// Seeds the Neo4j database with the skill catalogue and the COMPLEMENTS
// matrix. Reads from server/src/data/*.json via the skill service.
//
// Run with:  node scripts/seed-neo4j.js
//
// Idempotent — safe to re-run. Uses MERGE so duplicate runs produce the
// same graph state.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { session, verifyConnection, close } = require('../server/src/db/neo4j');
const skillService = require('../server/src/services/skill.service');

async function applySchema() {
  // Run the schema constraints + indexes file before any data inserts.
  const schemaPath = path.join(__dirname, '..', 'server', 'src', 'db', 'neo4j.schema.cypher');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Split on semicolons, ignore comment-only lines and empties.
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('//'));

  const s = session();
  try {
    for (const stmt of statements) {
      await s.run(stmt);
    }
  } finally {
    await s.close();
  }
  console.log(`  applied ${statements.length} schema statements`);
}

async function run() {
  console.log('Connecting to Neo4j...');
  await verifyConnection();
  console.log('  connected.');

  console.log('Applying schema...');
  await applySchema();

  console.log('Seeding skills...');
  const skillCount = await skillService.seedSkills();
  console.log(`  inserted ${skillCount} skills`);

  console.log('Seeding COMPLEMENTS edges...');
  const compCount = await skillService.seedComplements();
  console.log(`  inserted ${compCount} edges`);

  console.log('Done.');
  await close();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

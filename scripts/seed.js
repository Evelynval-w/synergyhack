// scripts/seed.js
//
// Unified seed runner. Calls the per-DB seeders in order.
// Run from repo root: npm run seed
//
// Order matters: Mongo first (source of truth for content),
// then Neo4j (which uses the same string IDs for cross-DB joins).
// Redis is not seeded — its data is created at runtime
// (sessions on login, presence on heartbeat, slots on team join, etc.).

const { spawnSync } = require('child_process');

function run(name, description) {
  console.log(`\n=== ${description} ===`);
  const result = spawnSync('node', [`scripts/seed-${name}.js`], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`\n${name} seed FAILED — stopping.`);
    process.exit(1);
  }
}

run('mongo', 'Seeding MongoDB');
run('neo4j', 'Seeding Neo4j');
console.log('\n=== All seeds complete. ===');

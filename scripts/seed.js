// scripts/seed.js
//
// Unified seed. Runs Mongo, Neo4j, Redis seeds in order.
// Run from repo root: npm run seed

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
run('redis', 'Seeding Redis');
console.log('\n=== All seeds complete. ===');

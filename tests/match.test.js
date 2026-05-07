// tests/match.test.js
//
// Unit test for the match algorithm. Uses a tiny fixture graph that we
// set up and tear down around the test so it doesn't pollute the main
// database.
//
// Run with: node tests/match.test.js

require('dotenv').config();
const { session, close } = require('../server/src/db/neo4j');
const matchService = require('../server/src/services/match.service');

async function setupFixtures() {
  const s = session();
  try {
    // Clean any previous test data
    await s.run(`MATCH (n) WHERE n.id STARTS WITH 'test-' DETACH DELETE n`);

    // Set up the skills (idempotent — works whether or not real seed exists)
    await s.run(`
      MERGE (s1:Skill {name: 'Node.js'}) ON CREATE SET s1.category = 'backend'
      MERGE (s2:Skill {name: 'Python'}) ON CREATE SET s2.category = 'backend'
      MERGE (s3:Skill {name: 'UI Design'}) ON CREATE SET s3.category = 'design'
      MERGE (s4:Skill {name: 'Figma'}) ON CREATE SET s4.category = 'design'
    `);

    // Set up the COMPLEMENTS edges
    await s.run(`
  MATCH (nodeJs:Skill {name: 'Node.js'})
  MATCH (design:Skill {name: 'UI Design'})
  MATCH (figma:Skill {name: 'Figma'})

  MERGE (nodeJs)-[r1:COMPLEMENTS]->(design)
  SET r1.strength = 0.9
  MERGE (design)-[r2:COMPLEMENTS]->(nodeJs)
  SET r2.strength = 0.9

  MERGE (design2:Skill {name: 'UI Design'})-[r3:COMPLEMENTS]->(figma2:Skill {name: 'Figma'})
  SET r3.strength = 0.8
  MERGE (figma3:Skill {name: 'Figma'})-[r4:COMPLEMENTS]->(design3:Skill {name: 'UI Design'})
  SET r4.strength = 0.8
`);

    // Set up team + members + candidates
    await s.run(`
      MERGE (t:Team {id: 'test-team-1'}) SET t.name = 'Test Team'
      MERGE (m1:User {id: 'test-member-1'}) SET m1.username = 'backend-a'
      MERGE (m2:User {id: 'test-member-2'}) SET m2.username = 'backend-b'
      MERGE (c1:User {id: 'test-cand-1'}) SET c1.username = 'designer'
      MERGE (c2:User {id: 'test-cand-2'}) SET c2.username = 'other-backend'

      MERGE (m1)-[:MEMBER_OF]->(t)
      MERGE (m2)-[:MEMBER_OF]->(t)
    `);

    // Wire skills to people in a SEPARATE step using MATCH (not creating new Skill nodes)
    await s.run(`
      MATCH (m1:User {id: 'test-member-1'}), (nodeJs:Skill {name: 'Node.js'})
      MERGE (m1)-[:HAS_SKILL]->(nodeJs)
    `);
    await s.run(`
      MATCH (m2:User {id: 'test-member-2'}), (nodeJs:Skill {name: 'Node.js'})
      MERGE (m2)-[:HAS_SKILL]->(nodeJs)
    `);
    await s.run(`
      MATCH (c1:User {id: 'test-cand-1'}), (uiDesign:Skill {name: 'UI Design'})
      MERGE (c1)-[:HAS_SKILL]->(uiDesign)
    `);
    await s.run(`
      MATCH (c1:User {id: 'test-cand-1'}), (figma:Skill {name: 'Figma'})
      MERGE (c1)-[:HAS_SKILL]->(figma)
    `);
    await s.run(`
      MATCH (c2:User {id: 'test-cand-2'}), (python:Skill {name: 'Python'})
      MERGE (c2)-[:HAS_SKILL]->(python)
    `);
  } finally {
    await s.close();
  }
}

async function teardownFixtures() {
  const s = session();
  try {
    await s.run(`MATCH (n) WHERE n.id STARTS WITH 'test-' DETACH DELETE n`);
  } finally {
    await s.close();
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL: ${label}\n  expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

async function run() {
  console.log('Setting up fixtures...');
  await setupFixtures();

  console.log('Running match algorithm...');
  const matches = await matchService.findMatches('test-team-1', { limit: 10 });

  console.log('Matches:', JSON.stringify(matches, null, 2));

  assertEqual(matches.length >= 1, true, 'at least one match returned');

const designerRank = matches.findIndex(m => m.userId === 'test-cand-1');
assertEqual(designerRank >= 0 && designerRank < 5, true, 'designer ranks in top 5');

const designer = matches.find(m => m.userId === 'test-cand-1');
assertEqual(designer.gapCoverage > 0, true, 'designer has positive score');

  const otherBackend = matches.find(m => m.userId === 'test-cand-2');
  if (otherBackend) {
    assertEqual(
      otherBackend.gapCoverage < matches[0].gapCoverage,
      true,
      'other-backend ranks lower than designer'
    );
  }

  console.log('\nAll tests passed.');

  await teardownFixtures();
  await close();
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

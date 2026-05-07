// server/src/services/skill.service.js
//
// Skill catalogue + COMPLEMENTS matrix management.
// Reads from JSON data files and exposes functions to seed the graph
// and to read skills back out.

const path = require('path');
const fs = require('fs');
const { session } = require('../db/neo4j');

// Load static data once at module load.
const SKILLS_FILE = path.join(__dirname, '..', 'data', 'skills.json');
const COMPLEMENTS_FILE = path.join(__dirname, '..', 'data', 'complements.json');

const skillsData = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8'));
const complementsData = JSON.parse(fs.readFileSync(COMPLEMENTS_FILE, 'utf8'));

/**
 * Inserts every skill from skills.json into Neo4j. Idempotent — uses MERGE
 * so re-running won't create duplicates. Safe to call from the seed script.
 */
async function seedSkills() {
  const s = session();
  try {
    for (const skill of skillsData.skills) {
      await s.run(
        'MERGE (sk:Skill {name: $name}) SET sk.category = $category',
        { name: skill.name, category: skill.category }
      );
    }
    return skillsData.skills.length;
  } finally {
    await s.close();
  }
}

/**
 * Inserts every COMPLEMENTS edge from complements.json.
 *
 * Each JSON entry { from, to, strength } produces TWO directed edges in the
 * graph: one from -> to and one to -> from, both with the same strength.
 * This lets the match query traverse complementarity directionally
 * (per professor's spec) while still capturing the symmetric meaning of
 * "these two skills complement each other."
 *
 * Idempotent via MERGE.
 */
async function seedComplements() {
  const edges = complementsData.complements;
  let count = 0;

  const s = session();
  try {
    for (const edge of edges) {
      await s.run(
        `MATCH (a:Skill {name: $from})
         MATCH (b:Skill {name: $to})
         MERGE (a)-[r1:COMPLEMENTS]->(b)
         SET r1.strength = $strength
         MERGE (b)-[r2:COMPLEMENTS]->(a)
         SET r2.strength = $strength`,
        { from: edge.from, to: edge.to, strength: edge.strength }
      );
      count += 2;
    }
    return count;
  } finally {
    await s.close();
  }
}

/**
 * Returns all skills, optionally filtered by category.
 */
async function listSkills(category = null) {
  const s = session();
  try {
    const query = category
      ? 'MATCH (s:Skill {category: $category}) RETURN s.name AS name, s.category AS category ORDER BY s.name'
      : 'MATCH (s:Skill) RETURN s.name AS name, s.category AS category ORDER BY s.category, s.name';
    const result = await s.run(query, { category });
    return result.records.map(r => ({
      name: r.get('name'),
      category: r.get('category'),
    }));
  } finally {
    await s.close();
  }
}

/**
 * Adds a skill to a user. Creates the user node if it doesn't exist
 * (the User itself is normally seeded separately, but we MERGE here for safety).
 *
 * level: 1-5 self-rated proficiency
 * years: integer years of experience
 */
async function addUserSkill(userId, skillName, level, years) {
  const s = session();
  try {
    await s.run(
      `
      MATCH (sk:Skill {name: $skillName})
      MERGE (u:User {id: $userId})
      MERGE (u)-[r:HAS_SKILL]->(sk)
      SET r.level = $level, r.years = $years
      `,
      { userId, skillName, level, years }
    );
  } finally {
    await s.close();
  }
}

/**
 * Removes a HAS_SKILL edge between a user and a skill.
 */
async function removeUserSkill(userId, skillName) {
  const s = session();
  try {
    await s.run(
      `
      MATCH (u:User {id: $userId})-[r:HAS_SKILL]->(sk:Skill {name: $skillName})
      DELETE r
      `,
      { userId, skillName }
    );
  } finally {
    await s.close();
  }
}

/**
 * Returns the skills a user has, with proficiency.
 */
async function getUserSkills(userId) {
  const s = session();
  try {
    const result = await s.run(
      `
      MATCH (u:User {id: $userId})-[r:HAS_SKILL]->(sk:Skill)
      RETURN sk.name AS name, sk.category AS category,
             r.level AS level, r.years AS years
      ORDER BY sk.category, sk.name
      `,
      { userId }
    );
    return result.records.map(r => ({
      name: r.get('name'),
      category: r.get('category'),
      level: r.get('level'),
      years: r.get('years'),
    }));
  } finally {
    await s.close();
  }
}

module.exports = {
  seedSkills,
  seedComplements,
  listSkills,
  addUserSkill,
  removeUserSkill,
  getUserSkills,
};

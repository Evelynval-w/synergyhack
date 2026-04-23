const neo4j = require('neo4j-driver');
require('dotenv').config();

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'changeme_in_real_env';

// Single shared driver instance for the whole app.
const driver = neo4j.driver(
  URI,
  neo4j.auth.basic(USER, PASSWORD),
  {
    // Reasonable defaults. Tune later if needed.
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 30 * 1000, // 30s
  }
);

/**
 * Returns a fresh Neo4j session. Caller is responsible for closing it
 * (use try/finally so the session always closes, even on errors).
 */
function session() {
  return driver.session();
}

/**
 * Verifies the driver can actually talk to the database. Call this once
 * on app startup so we fail loudly if Neo4j is unreachable.
 */
async function verifyConnection() {
  const s = session();
  try {
    await s.run('RETURN 1');
    return true;
  } finally {
    await s.close();
  }
}

/**
 * Closes the shared driver. Call once on graceful shutdown.
 */
async function close() {
  await driver.close();
}

module.exports = { driver, session, verifyConnection, close };

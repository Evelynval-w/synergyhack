// server/src/db/mongo.js
//
// Real MongoDB connector using the official `mongodb` driver.
// Provides a singleton MongoClient and exposes the active database via `db()`.
//
// Usage:
//   const { connect, db } = require('./db/mongo');
//   await connect();              // call once at server boot
//   db().collection('users')...   // use anywhere after connect()
//
// The function form `db()` (rather than a property `db`) is intentional —
// it lets services import `{ db }` and use it in the call site exactly the
// same way the previous fixture stub did, so no service files need to change.

const { MongoClient } = require('mongodb');

let client = null;
let database = null;

/**
 * Establishes the MongoClient connection. Idempotent — safe to call
 * multiple times; subsequent calls return the existing connection.
 */
async function connect() {
  if (database) return database;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set in the environment');
  }

  client = new MongoClient(uri);
  await client.connect();

  const dbName = process.env.MONGO_DB || 'synergyhack';
  database = client.db(dbName);

  return database;
}

/**
 * Returns the connected database instance. Throws if connect() has
 * not been called yet — fail loud rather than silently corrupting state.
 */
function getDb() {
  if (!database) {
    throw new Error('Mongo not connected. Call connect() before using the database.');
  }
  return database;
}

/**
 * Function alias for getDb(). Existing services do `db().collection(...)`,
 * so we expose `db` as a function to keep their call sites unchanged.
 */
function db() {
  return getDb();
}

/**
 * Lightweight liveness check used by the /health endpoint.
 * Pings the database — succeeds only if MongoDB is reachable AND auth is valid.
 */
async function verifyConnection() {
  try {
    if (!database) await connect();
    await database.command({ ping: 1 });
    return true;
  } catch (err) {
    console.error('MongoDB ping failed:', err.message);
    return false;
  }
}

/**
 * Closes the underlying client. Called from the graceful-shutdown
 * handler in index.js so connections aren't left open on SIGTERM.
 */
async function close() {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}

module.exports = {
  connect,
  getDb,
  db,
  verifyConnection,
  close,
  get client() {
    return client;
  },
};

// Placeholder Mongo connector — reads from JSON fixtures for now.
// Aadithya will replace with real MongoClient.

const fs = require('fs');
const path = require('path');

function loadFixture(name) {
  try {
    return JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'scripts', 'fixtures', name),
      'utf8'
    ));
  } catch (err) {
    return [];
  }
}

const data = {
  users: loadFixture('users.json'),
  teams: loadFixture('teams.json'),
  hackathons: loadFixture('hackathons.json'),
  past_projects: loadFixture('past_projects.json'),
};

function matchesQuery(item, query) {
  return Object.entries(query).every(([k, v]) => {
    if (typeof v === 'object' && v !== null && Array.isArray(v.$in)) {
      // Handle ObjectId instances by converting to string
      const candidates = v.$in.map(x => String(x));
      return candidates.includes(String(item[k]));
    }
    return String(item[k]) === String(v);
  });
}

function makeCollection(name) {
  const items = data[name] || [];
  return {
    findOne: async (query = {}) => {
      if (Object.keys(query).length === 0) return items[0] || null;
      return items.find(item => matchesQuery(item, query)) || null;
    },
    find: (query = {}, _options = {}) => ({
      toArray: async () => {
        if (Object.keys(query).length === 0) return items;
        return items.filter(item => matchesQuery(item, query));
      },
      limit: () => ({ toArray: async () => items }),
      project: () => ({ toArray: async () => items }),
    }),
    insertOne: async () => ({ insertedId: null }),
    updateOne: async () => ({ modifiedCount: 0 }),
  };
}

// Support BOTH `db()` (function returning db-like object) AND `db.collection(...)` (object form)
function dbFn() {
  return {
    collection: (name) => makeCollection(name),
  };
}
dbFn.collection = (name) => makeCollection(name);

module.exports = {
  db: dbFn,
  client: null,
  connect: async () => dbFn,
  close: async () => {},
};

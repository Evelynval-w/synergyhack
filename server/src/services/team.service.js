const { ObjectId } = require('mongodb');
const { db } = require('../db/mongo');

const COL = 'teams';

async function createTeam({ name, hackathonId, capacity = 4, description = '' }, creatorId) {
  if (!name || !hackathonId) throw new Error('Missing name or hackathonId');
  if (!ObjectId.isValid(hackathonId)) throw new Error('Invalid hackathonId');
  if (!ObjectId.isValid(creatorId)) throw new Error('Invalid creatorId');

  const doc = {
    name,
    hackathonId: new ObjectId(hackathonId),
    capacity,
    description,
    createdBy: new ObjectId(creatorId),
    createdAt: new Date(),
  };
  const result = await db().collection(COL).insertOne(doc);
  const fullDoc = { _id: result.insertedId, ...doc };

  try {
    const graphSync = require('./graph-sync.service');
    await graphSync.syncTeam(fullDoc);
    await graphSync.joinTeam(creatorId, result.insertedId.toString());
  } catch (err) {
    console.warn('Graph sync failed for team', result.insertedId, err.message);
  }

  return fullDoc;
}

async function getTeamById(id) {
  if (!ObjectId.isValid(id)) return null;
  return db().collection(COL).findOne({ _id: new ObjectId(id) });
}

async function listTeams({ hackathonId } = {}) {
  const query = {};
  if (hackathonId && ObjectId.isValid(hackathonId)) {
    query.hackathonId = new ObjectId(hackathonId);
  }
  return db().collection(COL).find(query).sort({ createdAt: -1 }).toArray();
}

module.exports = { createTeam, getTeamById, listTeams };
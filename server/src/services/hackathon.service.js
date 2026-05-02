const { ObjectId } = require('mongodb');
const { db } = require('../db/mongo');
 
const COL = 'hackathons';
 
async function createHackathon({ name, startDate, endDate, tracks = [], description = '', location = '' }) {
  const doc = {
    name,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    tracks,
    description,
    location,
    createdAt: new Date(),
  };
  const result = await db().collection(COL).insertOne(doc);
  return { _id: result.insertedId, ...doc };
}
 
async function listHackathons() {
  return db().collection(COL).find({}).sort({ startDate: 1 }).toArray();
}
 
async function getHackathonById(id) {
  if (!ObjectId.isValid(id)) return null;
  return db().collection(COL).findOne({ _id: new ObjectId(id) });
}
 
module.exports = { createHackathon, listHackathons, getHackathonById };

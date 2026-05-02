// server/src/services/analytics.service.js

const { db } = require('../db/mongo');

async function skillDemandByRole() {
  return db().collection('past_projects').aggregate([
    { $unwind: '$members' },
    { $unwind: '$skills_used' },
    {
      $group: {
        _id: { role: '$members.role', skill: '$skills_used' },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    {
      $group: {
        _id: '$_id.role',
        skills: {
          $push: {
            skill: '$_id.skill',
            count: '$count'
          }
        }
      }
    },
    {
      $project: {
        role: '$_id',
        topSkills: { $slice: ['$skills', 10] },
        _id: 0
      }
    },
    { $sort: { role: 1 } }
  ]).toArray();
}

async function successfulTeamPatterns() {
  return db().collection('past_projects').aggregate([
    { $match: { rating: { $gt: 4 } } },
    { $unwind: '$members' },
    {
      $group: {
        _id: '$_id',
        roles: { $addToSet: '$members.role' }
      }
    },
    {
      $project: {
        _id: 0,
        sortedRoles: { $sortArray: { input: '$roles', sortBy: 1 } }
      }
    },
    {
      $group: {
        _id: '$sortedRoles',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 0,
        roleCombination: '$_id',
        occurrences: '$count'
      }
    }
  ]).toArray();
}

module.exports = { skillDemandByRole, successfulTeamPatterns };
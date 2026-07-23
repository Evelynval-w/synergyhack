// server/src/routes/hackathons.routes.js
//
// Event (hackathon) listing, detail, org CRUD, registration, invites, leaderboard.

const express = require('express');
const { requireAuth, requireOrg } = require('../middleware/auth');
const eventService = require('../services/event.service');
const registration = require('../services/registration.service');
const { db } = require('../db/mongo');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const results = await eventService.listEventsForUser(req.user.sub);
    res.json({ count: results.length, results });
  } catch (err) {
    console.error('GET /hackathons failed:', err);
    res.status(500).json({ error: 'List failed' });
  }
});

router.post('/', requireAuth, requireOrg, async (req, res) => {
  try {
    const doc = await eventService.createEvent(req.user.sub, req.body || {});
    res.status(201).json(doc);
  } catch (err) {
    if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('POST /hackathons failed:', err);
    res.status(500).json({ error: 'Create failed' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const event = await eventService.getEvent(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const allowed = await eventService.canViewEvent(event, req.user.sub);
    if (!allowed) return res.status(403).json({ error: 'Private event' });

    const teams = await eventService.listEventTeams(event._id);
    const myRegs = await db().collection('event_registrations')
      .find({
        eventId: event._id,
        $or: [
          { userId: req.user.sub },
          { teamId: { $in: teams.filter(t => (t.members || []).includes(req.user.sub)).map(t => t._id) } },
        ],
      })
      .toArray();

    let leaderboard = [];
    if (event.leaderboardEnabled) {
      leaderboard = await registration.getLeaderboard(event._id);
    }

    res.json({
      ...event,
      teams: teams.map(t => ({
        _id: t._id,
        name: t.name,
        description: t.description,
        capacity: t.capacity,
        memberCount: (t.members || []).length,
        createdBy: t.createdBy,
        isMember: (t.members || []).includes(req.user.sub),
      })),
      myRegistrations: myRegs,
      leaderboard,
      isHost: event.createdByOrgId === req.user.sub,
    });
  } catch (err) {
    console.error('GET /hackathons/:id failed:', err);
    res.status(500).json({ error: 'Detail failed' });
  }
});

router.patch('/:id', requireAuth, requireOrg, async (req, res) => {
  try {
    const updated = await eventService.updateEvent(req.params.id, req.user.sub, req.body || {});
    res.json(updated);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('PATCH /hackathons/:id failed:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

router.post('/:id/register', requireAuth, async (req, res) => {
  try {
    const { teamId } = req.body || {};
    const doc = teamId
      ? await registration.registerTeam(req.params.id, req.user.sub, teamId)
      : await registration.registerUser(req.params.id, req.user.sub);
    res.status(201).json(doc);
  } catch (err) {
    if (err instanceof registration.RegError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('POST /hackathons/:id/register failed:', err);
    res.status(500).json({ error: 'Register failed' });
  }
});

router.post('/:id/invite', requireAuth, async (req, res) => {
  try {
    const doc = await registration.inviteUserToEvent(req.params.id, req.user.sub, req.body || {});
    res.status(201).json(doc);
  } catch (err) {
    if (err instanceof registration.RegError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('POST /hackathons/:id/invite failed:', err);
    res.status(500).json({ error: 'Invite failed' });
  }
});

router.get('/:id/registrations', requireAuth, requireOrg, async (req, res) => {
  try {
    const results = await registration.listRegistrations(req.params.id, req.user.sub);
    res.json({ count: results.length, results });
  } catch (err) {
    if (err instanceof registration.RegError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('GET registrations failed:', err);
    res.status(500).json({ error: 'List failed' });
  }
});

router.post('/:id/registrations/:regId/accept', requireAuth, async (req, res) => {
  try {
    const updated = await registration.acceptRegistration(
      req.params.id,
      req.params.regId,
      req.user.sub,
      { inviteToken: req.body?.inviteToken }
    );
    res.json(updated);
  } catch (err) {
    if (err instanceof registration.RegError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('accept registration failed:', err);
    res.status(500).json({ error: 'Accept failed' });
  }
});

router.post('/:id/registrations/:regId/reject', requireAuth, requireOrg, async (req, res) => {
  try {
    const updated = await registration.rejectRegistration(
      req.params.id,
      req.params.regId,
      req.user.sub
    );
    res.json(updated);
  } catch (err) {
    if (err instanceof registration.RegError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('reject registration failed:', err);
    res.status(500).json({ error: 'Reject failed' });
  }
});

router.get('/:id/leaderboard', requireAuth, async (req, res) => {
  try {
    const event = await eventService.getEvent(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (!event.leaderboardEnabled && event.createdByOrgId !== req.user.sub) {
      return res.status(403).json({ error: 'Leaderboard disabled' });
    }
    const allowed = await eventService.canViewEvent(event, req.user.sub);
    if (!allowed) return res.status(403).json({ error: 'Private event' });
    const results = await registration.getLeaderboard(req.params.id);
    res.json({ count: results.length, results });
  } catch (err) {
    console.error('GET leaderboard failed:', err);
    res.status(500).json({ error: 'Leaderboard failed' });
  }
});

router.put('/:id/leaderboard', requireAuth, requireOrg, async (req, res) => {
  try {
    const results = await registration.putLeaderboard(
      req.params.id,
      req.user.sub,
      req.body?.entries || []
    );
    res.json({ count: results.length, results });
  } catch (err) {
    if (err instanceof registration.RegError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('PUT leaderboard failed:', err);
    res.status(500).json({ error: 'Leaderboard update failed' });
  }
});

module.exports = router;

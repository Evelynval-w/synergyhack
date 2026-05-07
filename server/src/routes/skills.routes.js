// server/src/routes/skills.routes.js
//
// GET /skills
// Returns the full skill catalogue for the profile editor's typeahead.
// Source of truth is Neo4j (where Skill nodes live with category info),
// not the static JSON — this means skills added via future admin tools
// will surface here automatically.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const skillService = require('../services/skill.service');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const category = req.query.category || null;
    const skills = await skillService.listSkills(category);
    res.json(skills);
  } catch (err) {
    console.error('list skills failed:', err);
    res.status(500).json({ error: 'List failed' });
  }
});

module.exports = router;

const express = require('express');
const hackathonService = require('../services/hackathon.service');
const { requireAuth } = require('../middleware/auth');
 
const router = express.Router();
 
router.get('/', async (req, res) => {
  const list = await hackathonService.listHackathons();
  res.json(list);
});
 
router.get('/:id', async (req, res) => {
  const h = await hackathonService.getHackathonById(req.params.id);
  if (!h) return res.status(404).json({ error: 'Hackathon not found' });
  res.json(h);
});
 
router.post('/', requireAuth, async (req, res) => {
  try {
    const h = await hackathonService.createHackathon(req.body);
    res.status(201).json(h);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
 
module.exports = router;

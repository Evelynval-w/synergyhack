const express = require('express');
const authService = require('../services/auth.service');
 
const router = express.Router();
 
router.post('/register', async (req, res) => {
  try {
    const { user, token } = await authService.register(req.body);
    res.status(201).json({ user, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
 
router.post('/login', async (req, res) => {
  try {
    const { user, token } = await authService.login(req.body);
    res.json({ user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});
 
module.exports = router;

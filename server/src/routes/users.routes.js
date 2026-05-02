const express = require('express');
const userService = require('../services/user.service');
const { requireAuth } = require('../middleware/auth');
 
const router = express.Router();
 
// GET /users/:id — public (anyone can see a user profile)
router.get('/:id', async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});
 
// PATCH /users/:id — auth required, you can only edit your own profile
router.patch('/:id', requireAuth, async (req, res) => {
  if (req.params.id !== req.user.id) {
    return res.status(403).json({ error: 'Cannot edit another user' });
  }
  const updated = await userService.updateUser(req.params.id, req.body);
  if (!updated) return res.status(400).json({ error: 'No valid updates' });
  res.json(updated);
});
 
module.exports = router;

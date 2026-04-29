const { client } = require('../db/redis');

function key(teamId) {
  return `team:${teamId}:slots`;
}

// initialize team
async function initSlots(teamId, capacity) {
  await client.hSet(key(teamId), {
    capacity: String(capacity),
    filled: '0'
  });
}

// claim a slot (atomic)
async function claimSlot(teamId) {
  const k = key(teamId);

  const filled = await client.hIncrBy(k, 'filled', 1);
  const capacity = parseInt(await client.hGet(k, 'capacity'), 10);

  if (filled > capacity) {
    // rollback
    await client.hIncrBy(k, 'filled', -1);
    return false;
  }

  return true;
}

module.exports = { initSlots, claimSlot };
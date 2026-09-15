const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db/db');

// GET all items for a production
router.get('/', (req, res) => {
  const items = db.getItemsByProduction(req.params.productionId);
  res.json(items);
});

// POST create item (zone = 'timeline' | 'standby')
router.post('/', (req, res) => {
  const zone = req.query.zone || 'standby';
  const item = db.createItem(req.params.productionId, req.body, zone);
  res.status(201).json(item);
});

// PUT update item
router.put('/:itemId', (req, res) => {
  const item = db.updateItem(req.params.itemId, req.body);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// DELETE item
router.delete('/:itemId', (req, res) => {
  db.deleteItem(req.params.itemId);
  res.json({ ok: true });
});

// POST reorder a zone
router.post('/reorder', (req, res) => {
  const { zone, orderedIds } = req.body;
  db.reorderZone(req.params.productionId, zone, orderedIds);
  res.json({ ok: true });
});

// POST move item between zones
router.post('/move', (req, res) => {
  const { itemId, fromZone, toZone, insertIndex } = req.body;
  db.moveItem(req.params.productionId, itemId, fromZone, toZone, insertIndex);
  res.json({ ok: true });
});

// POST toggle task
router.post('/:itemId/tasks/:taskId/toggle', (req, res) => {
  const { complete } = req.body;
  const item = db.toggleTask(req.params.itemId, req.params.taskId, complete);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

module.exports = router;

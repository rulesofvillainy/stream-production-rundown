const express = require('express');
const router = express.Router();
const db = require('../db/db');

// GET all productions
router.get('/', (req, res) => {
  res.json(db.getAllProductions());
});

// POST create production
router.post('/', (req, res) => {
  const prod = db.createProduction(req.body);
  res.status(201).json(prod);
});

// GET single production
router.get('/:id', (req, res) => {
  const prod = db.getProduction(req.params.id);
  if (!prod) return res.status(404).json({ error: 'Not found' });
  res.json(prod);
});

// PUT update production
router.put('/:id', (req, res) => {
  const prod = db.updateProduction(req.params.id, req.body);
  if (!prod) return res.status(404).json({ error: 'Not found' });
  res.json(prod);
});

// DELETE production
router.delete('/:id', (req, res) => {
  db.deleteProduction(req.params.id);
  res.json({ ok: true });
});

// POST import production from JSON
router.post('/import', (req, res) => {
  try {
    const prod = db.importProduction(req.body);
    res.status(201).json(prod);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET export production as JSON
router.get('/:id/export', (req, res) => {
  const data = db.exportProduction(req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Disposition', `attachment; filename="${data.name.replace(/[^a-z0-9]/gi, '_')}.json"`);
  res.json(data);
});

// GET production settings
router.get('/:id/settings', (req, res) => {
  const prod = db.getProduction(req.params.id);
  if (!prod) return res.status(404).json({ error: 'Not found' });
  res.json(prod.settings);
});

// PUT production settings
router.put('/:id/settings', (req, res) => {
  const prod = db.updateProduction(req.params.id, { settings: req.body });
  res.json(prod.settings);
});

module.exports = router;

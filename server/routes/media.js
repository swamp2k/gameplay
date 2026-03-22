'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/media?folder=...&type=video|photo&page=1&limit=100
router.get('/', (req, res) => {
  const { folder, type, page, limit } = req.query;
  const result = db.list({
    folder: folder || null,
    type: type || null,
    page: parseInt(page, 10) || 1,
    limit: Math.min(parseInt(limit, 10) || 100, 500),
  });
  const folders = db.listFolders();
  res.json({ ...result, folders });
});

// GET /api/media/:id
router.get('/:id', (req, res) => {
  const media = db.getById(req.params.id);
  if (!media) return res.status(404).json({ error: 'Not found' });
  res.json(media);
});

module.exports = router;

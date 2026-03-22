'use strict';

const express = require('express');
const db = require('../db');
const thumbnailer = require('../services/thumbnailer');

const router = express.Router();

// GET /thumbnail/:id
router.get('/:id', async (req, res) => {
  const media = db.getById(req.params.id);
  if (!media) return res.status(404).json({ error: 'Not found' });

  try {
    const thumbPath = await thumbnailer.getThumbnail(media.id, media.path);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(thumbPath);
  } catch (err) {
    console.error('[thumbnail] Failed to generate thumbnail:', err.message);
    res.status(500).json({ error: 'Thumbnail generation failed' });
  }
});

module.exports = router;

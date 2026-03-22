'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const security = require('../services/security');

const router = express.Router();

// GET /download/:id  — force file download
router.get('/:id', (req, res) => {
  const media = db.getById(req.params.id);
  if (!media) return res.status(404).json({ error: 'Not found' });

  let filePath;
  try {
    filePath = security.assertAllowedPath(media.path);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const filename = path.basename(filePath);
  const stat = fs.statSync(filePath);

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', 'application/octet-stream');

  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;

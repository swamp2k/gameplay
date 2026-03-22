'use strict';

const express = require('express');
const fs = require('fs');
const mime = require('mime-types');
const db = require('../db');
const security = require('../services/security');

const router = express.Router();

// GET /stream/:id  — direct streaming with range request support
router.get('/:id', (req, res) => {
  const media = db.getById(req.params.id);
  if (!media) return res.status(404).json({ error: 'Not found' });

  let filePath;
  try {
    filePath = security.assertAllowedPath(media.path);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const contentType = mime.lookup(filePath) || 'application/octet-stream';
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;

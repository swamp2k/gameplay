'use strict';

const express = require('express');
const fs = require('fs');
const db = require('../db');
const security = require('../services/security');
const transcoder = require('../services/transcoder');

const router = express.Router();

// GET /transcode/:id/master.m3u8  — start or resume HLS job, return master playlist
router.get('/:id/master.m3u8', async (req, res) => {
  const media = db.getById(req.params.id);
  if (!media) return res.status(404).json({ error: 'Not found' });
  if (media.type !== 'video') return res.status(400).json({ error: 'Not a video' });

  let filePath;
  try {
    filePath = security.assertAllowedPath(media.path);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  transcoder.startJob(media.id, filePath);

  // Wait for at least first rendition to have 2 segments ready
  const firstRendition = transcoder.RENDITIONS[0].name;
  const ready = await transcoder.waitForSegments(media.id, firstRendition, 2, 60000);

  if (!ready) {
    return res.status(503).json({ error: 'Transcode timed out initializing' });
  }

  transcoder.touchJob(media.id);

  const masterPath = transcoder.masterPlaylistPath(media.id);
  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(masterPath);
});

// GET /transcode/:id/:rendition/playlist.m3u8
router.get('/:id/:rendition/playlist.m3u8', async (req, res) => {
  const { id, rendition } = req.params;

  transcoder.touchJob(id);

  const playlistPath = transcoder.renditionPlaylistPath(id, rendition);

  // Wait up to 30s for playlist to appear
  let attempts = 0;
  while (!fs.existsSync(playlistPath) && attempts < 150) {
    await new Promise(r => setTimeout(r, 200));
    attempts++;
  }

  if (!fs.existsSync(playlistPath)) {
    return res.status(404).json({ error: 'Playlist not ready' });
  }

  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(playlistPath);
});

// GET /transcode/:id/:rendition/:segment.ts
router.get('/:id/:rendition/:segment', async (req, res) => {
  const { id, rendition, segment } = req.params;

  if (!segment.endsWith('.ts')) return res.status(400).end();

  transcoder.touchJob(id);

  const segPath = transcoder.segmentPath(id, rendition, segment.replace('.ts', ''));
  const found = await transcoder.waitForSegment(segPath, 30000);

  if (!found) {
    return res.status(404).end();
  }

  res.setHeader('Content-Type', 'video/MP2T');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(segPath);
});

module.exports = router;

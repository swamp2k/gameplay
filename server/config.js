'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');

function load() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  // Resolve mediaPaths to absolute real paths, skipping ones that don't exist
  const allowedRoots = [];
  for (const p of raw.mediaPaths) {
    const abs = path.resolve(p);
    try {
      const real = fs.realpathSync(abs);
      allowedRoots.push(real);
    } catch {
      console.warn(`[config] Media path does not exist, skipping: ${abs}`);
    }
  }

  const cacheDir = path.resolve(__dirname, '..', raw.cacheDir || './cache');

  return {
    port: raw.port || 3000,
    mediaPaths: raw.mediaPaths,
    allowedRoots,
    cacheDir,
    thumbnailDir: path.join(cacheDir, 'thumbnails'),
    hlsDir: path.join(cacheDir, 'hls'),
    dbPath: path.join(cacheDir, 'media.db'),
    transcoding: raw.transcoding || {},
    scanner: {
      videoExtensions: raw.scanner?.videoExtensions || ['.mkv', '.mp4', '.mov', '.avi', '.m4v', '.webm'],
      photoExtensions: raw.scanner?.photoExtensions || ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
      rescanIntervalMinutes: raw.scanner?.rescanIntervalMinutes || 60,
    },
  };
}

module.exports = load();

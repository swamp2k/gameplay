'use strict';

const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const glob = require('fast-glob');
const config = require('../config');
const db = require('../db');

const execFileAsync = promisify(execFile);

function makeId(filePath) {
  return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

function needsTranscode(codec, container) {
  if (codec === 'h264' && ['mp4', 'mov', 'm4v'].includes(container)) return 0;
  return 1;
}

async function ffprobe(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ]);
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function extractMetadata(probeData) {
  if (!probeData) return {};

  const videoStream = probeData.streams?.find(s => s.codec_type === 'video');
  const fmt = probeData.format || {};
  const container = (fmt.format_name || '').split(',')[0].toLowerCase().trim();

  return {
    duration: parseFloat(fmt.duration) || null,
    width: videoStream?.width || null,
    height: videoStream?.height || null,
    codec: videoStream?.codec_name?.toLowerCase() || null,
    container,
    size: parseInt(fmt.size, 10) || null,
  };
}

async function scanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = config.scanner.videoExtensions.includes(ext);
  const isPhoto = config.scanner.photoExtensions.includes(ext);
  if (!isVideo && !isPhoto) return null;

  const type = isVideo ? 'video' : 'photo';
  let meta = { size: null, duration: null, width: null, height: null, codec: null, container: null };

  if (isVideo) {
    const probeData = await ffprobe(filePath);
    Object.assign(meta, extractMetadata(probeData));
  }

  return {
    id: makeId(filePath),
    path: filePath,
    name: path.basename(filePath),
    folder: path.dirname(filePath),
    type,
    size: meta.size,
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    codec: meta.codec,
    container: meta.container,
    needs_transcode: isVideo ? needsTranscode(meta.codec, meta.container) : 0,
    scanned_at: new Date().toISOString(),
  };
}

async function runScan() {
  if (config.allowedRoots.length === 0) {
    console.warn('[scanner] No valid media paths configured. Check config.json.');
    return;
  }

  console.log('[scanner] Starting scan of:', config.mediaPaths);

  const patterns = config.allowedRoots.map(r => `${r}/**/*`);
  const allFiles = await glob(patterns, { onlyFiles: true, followSymbolicLinks: false });

  const scannedPaths = [];
  let added = 0, skipped = 0;

  for (const filePath of allFiles) {
    const ext = path.extname(filePath).toLowerCase();
    const supported = [
      ...config.scanner.videoExtensions,
      ...config.scanner.photoExtensions,
    ];
    if (!supported.includes(ext)) { skipped++; continue; }

    try {
      const record = await scanFile(filePath);
      if (record) {
        db.upsert(record);
        scannedPaths.push(filePath);
        added++;
      }
    } catch (err) {
      console.error('[scanner] Error scanning file:', filePath, err.message);
    }
  }

  db.removeStale(scannedPaths);
  console.log(`[scanner] Done. ${added} files indexed, ${skipped} unsupported skipped.`);
}

module.exports = { runScan, scanFile, makeId };

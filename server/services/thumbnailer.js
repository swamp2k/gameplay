'use strict';

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const PQueue = require('p-queue').default;
const config = require('../config');

const execFileAsync = promisify(execFile);
const queue = new PQueue({ concurrency: 2 });

/**
 * Returns the thumbnail path for a given media ID.
 * Generates the thumbnail if it doesn't exist yet.
 */
async function getThumbnail(mediaId, sourcePath) {
  const thumbPath = path.join(config.thumbnailDir, `${mediaId}.jpg`);

  if (fs.existsSync(thumbPath)) return thumbPath;

  await queue.add(() => generate(sourcePath, thumbPath));
  return thumbPath;
}

async function generate(sourcePath, thumbPath) {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

  const ext = path.extname(sourcePath).toLowerCase();
  const isPhoto = config.scanner.photoExtensions.includes(ext);

  if (isPhoto) {
    // For photos, use ffmpeg to resize
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', sourcePath,
      '-vf', 'scale=320:-1',
      '-q:v', '4',
      thumbPath,
    ]);
  } else {
    // For video: seek to 5s, grab 1 frame
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', '00:00:05',
      '-i', sourcePath,
      '-vframes', '1',
      '-vf', 'scale=320:-1',
      '-q:v', '4',
      thumbPath,
    ]);
  }
}

module.exports = { getThumbnail };

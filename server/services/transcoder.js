'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const PQueue = require('p-queue').default;
const config = require('../config');

const queue = new PQueue({ concurrency: config.transcoding?.maxConcurrentJobs || 2 });

// In-memory job state: mediaId -> { status, processes, lastAccess, renditionReady }
const jobs = new Map();

const SEGMENT_DURATION = config.transcoding?.segmentDuration || 6;
const RENDITIONS = config.transcoding?.renditions || [
  { name: '720p', resolution: '1280x720', videoBitrate: '2500k', audioBitrate: '128k' },
];
const CLEANUP_IDLE_MS = 30 * 60 * 1000; // 30 minutes

// Periodic cleanup of idle jobs
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.lastAccess > CLEANUP_IDLE_MS) {
      stopJob(id);
    }
  }
}, 5 * 60 * 1000);

function jobDir(mediaId) {
  return path.join(config.hlsDir, mediaId);
}

function masterPlaylistPath(mediaId) {
  return path.join(jobDir(mediaId), 'master.m3u8');
}

function renditionPlaylistPath(mediaId, renditionName) {
  return path.join(jobDir(mediaId), renditionName, 'playlist.m3u8');
}

function segmentPath(mediaId, renditionName, segment) {
  return path.join(jobDir(mediaId), renditionName, `${segment}.ts`);
}

function stopJob(mediaId) {
  const job = jobs.get(mediaId);
  if (!job) return;

  for (const proc of job.processes) {
    try { proc.kill('SIGTERM'); } catch {}
  }

  // Remove HLS segments but leave the directory for debugging
  const dir = jobDir(mediaId);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

  jobs.delete(mediaId);
  console.log(`[transcoder] Cleaned up job: ${mediaId}`);
}

function writeMasterPlaylist(mediaId) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const r of RENDITIONS) {
    const [w, h] = r.resolution.split('x');
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(r.videoBitrate) * 1000},RESOLUTION=${r.resolution}`);
    lines.push(`${r.name}/playlist.m3u8`);
  }
  fs.writeFileSync(masterPlaylistPath(mediaId), lines.join('\n') + '\n');
}

function spawnTranscode(sourcePath, mediaId, rendition, useQsv) {
  const outDir = path.join(jobDir(mediaId), rendition.name);
  fs.mkdirSync(outDir, { recursive: true });

  const [w, h] = rendition.resolution.split('x');

  let args;
  if (useQsv) {
    args = [
      '-hwaccel', 'qsv',
      '-hwaccel_output_format', 'qsv',
      '-i', sourcePath,
      '-c:v', 'h264_qsv',
      '-preset', 'veryfast',
      '-b:v', rendition.videoBitrate,
      '-vf', `scale_qsv=${w}:${h}`,
      '-c:a', 'aac',
      '-b:a', rendition.audioBitrate || '128k',
      '-f', 'hls',
      '-hls_time', String(SEGMENT_DURATION),
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(outDir, '%04d.ts'),
      path.join(outDir, 'playlist.m3u8'),
    ];
  } else {
    // Software fallback or fast remux for H264-in-MKV
    args = [
      '-i', sourcePath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-vf', `scale=${w}:${h}`,
      '-c:a', 'aac',
      '-b:a', rendition.audioBitrate || '128k',
      '-f', 'hls',
      '-hls_time', String(SEGMENT_DURATION),
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(outDir, '%04d.ts'),
      path.join(outDir, 'playlist.m3u8'),
    ];
  }

  const proc = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  proc.stderr.on('data', d => { stderr += d.toString(); });

  proc.on('exit', (code) => {
    if (code !== 0 && useQsv && config.transcoding?.fallbackToSoftware) {
      console.warn(`[transcoder] QSV failed for ${mediaId}/${rendition.name}, retrying with software`);
      const softProc = spawnTranscode(sourcePath, mediaId, rendition, false);
      const job = jobs.get(mediaId);
      if (job) { job.processes.push(softProc); }
    } else if (code !== 0) {
      console.error(`[transcoder] FFmpeg exited ${code} for ${mediaId}/${rendition.name}`);
      console.error(stderr.slice(-2000));
    }
  });

  return proc;
}

/**
 * Start a transcode job for a given source file.
 * Idempotent - returns immediately if job already running.
 */
function startJob(mediaId, sourcePath) {
  if (jobs.has(mediaId)) {
    jobs.get(mediaId).lastAccess = Date.now();
    return;
  }

  console.log(`[transcoder] Starting job: ${mediaId} -> ${sourcePath}`);

  fs.mkdirSync(jobDir(mediaId), { recursive: true });
  writeMasterPlaylist(mediaId);

  const useQsv = config.transcoding?.hwaccel === 'qsv';
  const processes = [];

  queue.add(() => {
    for (const rendition of RENDITIONS) {
      const proc = spawnTranscode(sourcePath, mediaId, rendition, useQsv);
      processes.push(proc);
    }
    return Promise.resolve(); // queue slot just used for concurrency limiting
  });

  jobs.set(mediaId, {
    sourcePath,
    processes,
    lastAccess: Date.now(),
    startedAt: Date.now(),
  });
}

/**
 * Wait until a minimum number of segments exist for a rendition playlist.
 */
async function waitForSegments(mediaId, renditionName, minSegments = 3, timeoutMs = 60000) {
  const start = Date.now();
  const dir = path.join(jobDir(mediaId), renditionName);

  while (Date.now() - start < timeoutMs) {
    const segments = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => f.endsWith('.ts')).length
      : 0;
    if (segments >= minSegments) return true;
    await sleep(300);
  }
  return false;
}

/**
 * Wait until a specific segment file exists.
 */
async function waitForSegment(segPath, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(segPath)) return true;
    await sleep(200);
  }
  return false;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function touchJob(mediaId) {
  const job = jobs.get(mediaId);
  if (job) job.lastAccess = Date.now();
}

module.exports = {
  startJob,
  stopJob,
  masterPlaylistPath,
  renditionPlaylistPath,
  segmentPath,
  waitForSegments,
  waitForSegment,
  touchJob,
  RENDITIONS,
};

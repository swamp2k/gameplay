import videojs from 'video.js';
import { getMedia, streamUrl, transcodeUrl, downloadUrl } from './api.js';

let player = null;

export async function renderPlayer(mediaId, container) {
  const media = await getMedia(mediaId);

  const isHls = media.needs_transcode === 1;
  const src = isHls
    ? { src: transcodeUrl(mediaId), type: 'application/x-mpegURL' }
    : { src: streamUrl(mediaId),    type: getMimeType(media) };

  container.innerHTML = `
    <div class="player-page">
      <button class="back-btn" id="back-btn">&#8592; Back</button>
      <h2 class="player-title">${escapeHtml(media.name)}</h2>

      <div class="player-wrap">
        <video
          id="media-player"
          class="video-js vjs-default-skin vjs-big-play-centered"
          controls
          preload="metadata"
        ></video>
      </div>

      <div class="player-meta">
        ${media.duration ? `<span>${formatDuration(media.duration)}</span>` : ''}
        ${media.width && media.height ? `<span>${media.width}×${media.height}</span>` : ''}
        ${media.codec ? `<span>${media.codec.toUpperCase()}${isHls ? ' → HLS' : ''}</span>` : ''}
        ${media.size ? `<span>${formatSize(media.size)}</span>` : ''}
        <a class="download-btn" href="${downloadUrl(mediaId)}" download="${escapeHtml(media.name)}">
          &#x2B07; Download
        </a>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    history.back();
  });

  if (player) {
    player.dispose();
    player = null;
  }

  player = videojs('media-player', {
    controls: true,
    fluid: true,
    responsive: true,
    html5: {
      vhs: {
        overrideNative: !videojs.browser.IS_SAFARI,
        enableLowInitialPlaylist: true,
      },
    },
  });

  player.src(src);
  player.play().catch(() => {}); // autoplay may be blocked
}

export function disposePlayer() {
  if (player) {
    player.dispose();
    player = null;
  }
}

function getMimeType(media) {
  const ext = (media.container || '').toLowerCase();
  const map = { mp4: 'video/mp4', mov: 'video/mp4', m4v: 'video/mp4',
                 mkv: 'video/x-matroska', webm: 'video/webm',
                 avi: 'video/x-msvideo' };
  return map[ext] || 'video/mp4';
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

function formatSize(bytes) {
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

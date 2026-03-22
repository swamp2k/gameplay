import 'video.js/dist/video-js.css';
import { renderGallery } from './gallery.js';
import { renderPlayer, disposePlayer } from './player.js';
import './style.css';

const app = document.getElementById('app');

async function route() {
  const params = new URLSearchParams(location.search);
  const playId = params.get('play');
  const folder  = params.get('folder') || null;
  const type    = params.get('type')   || null;

  disposePlayer();

  if (playId) {
    try {
      await renderPlayer(playId, app);
    } catch (err) {
      app.innerHTML = `<div class="error">Failed to load media: ${err.message}</div>`;
    }
  } else {
    try {
      await renderGallery(app, { folder, type });
    } catch (err) {
      app.innerHTML = `<div class="error">Failed to load library: ${err.message}</div>`;
    }
  }
}

window.addEventListener('popstate', route);
route();

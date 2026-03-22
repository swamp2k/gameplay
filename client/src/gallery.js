import { listMedia, thumbnailUrl, downloadUrl } from './api.js';

export async function renderGallery(container, { folder, type } = {}) {
  container.innerHTML = '<div class="loading">Loading media library...</div>';

  let allItems = [];
  let folders = [];
  let page = 1;
  const limit = 100;

  // Load all pages
  while (true) {
    const data = await listMedia({ folder, type, page, limit });
    allItems = allItems.concat(data.items);
    if (folders.length === 0) folders = data.folders || [];
    if (allItems.length >= data.total) break;
    page++;
  }

  container.innerHTML = `
    <div class="gallery-page">
      <header class="gallery-header">
        <h1>Media Library</h1>
        <div class="gallery-controls">
          <div class="folder-select-wrap">
            <select id="folder-select">
              <option value="">All folders</option>
              ${folders.map(f => `<option value="${escapeHtml(f)}" ${f === folder ? 'selected' : ''}>${escapeHtml(shortFolder(f))}</option>`).join('')}
            </select>
          </div>
          <div class="type-filter">
            <button class="filter-btn ${!type ? 'active' : ''}" data-type="">All</button>
            <button class="filter-btn ${type === 'video' ? 'active' : ''}" data-type="video">Videos</button>
            <button class="filter-btn ${type === 'photo' ? 'active' : ''}" data-type="photo">Photos</button>
          </div>
        </div>
        <p class="item-count">${allItems.length} items</p>
      </header>

      <div class="media-grid" id="media-grid">
        ${allItems.map(item => renderCard(item)).join('')}
      </div>
    </div>
  `;

  // Folder change
  document.getElementById('folder-select').addEventListener('change', e => {
    const params = new URLSearchParams(location.search);
    if (e.target.value) params.set('folder', e.target.value);
    else params.delete('folder');
    history.pushState({}, '', `?${params}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  // Type filter buttons
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const params = new URLSearchParams(location.search);
      if (btn.dataset.type) params.set('type', btn.dataset.type);
      else params.delete('type');
      history.pushState({}, '', `?${params}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  });

  // Click on card to play/view
  document.getElementById('media-grid').addEventListener('click', e => {
    const card = e.target.closest('.media-card[data-id]');
    if (!card || e.target.closest('.download-icon')) return;
    const id = card.dataset.id;
    const params = new URLSearchParams(location.search);
    params.set('play', id);
    history.pushState({}, '', `?${params}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  // Lazy load thumbnails
  setupLazyLoad();
}

function renderCard(item) {
  const isVideo = item.type === 'video';
  const badge = isVideo
    ? `<span class="badge ${item.needs_transcode ? 'badge-transcode' : 'badge-direct'}">${item.codec ? item.codec.toUpperCase() : 'VIDEO'}</span>`
    : `<span class="badge badge-photo">PHOTO</span>`;

  const duration = isVideo && item.duration ? formatDuration(item.duration) : '';

  return `
    <div class="media-card" data-id="${item.id}" data-type="${item.type}" title="${escapeHtml(item.name)}">
      <div class="card-thumb">
        <img data-src="${thumbnailUrl(item.id)}" src="/placeholder.svg" alt="${escapeHtml(item.name)}" loading="lazy" />
        ${isVideo ? '<div class="play-overlay">&#9654;</div>' : ''}
        ${duration ? `<span class="duration">${duration}</span>` : ''}
        ${badge}
      </div>
      <div class="card-info">
        <span class="card-name">${escapeHtml(item.name)}</span>
        <a class="download-icon" href="${downloadUrl(item.id)}" download="${escapeHtml(item.name)}" title="Download">&#x2B07;</a>
      </div>
    </div>
  `;
}

function setupLazyLoad() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      }
    });
  }, { rootMargin: '300px' });

  document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

function shortFolder(f) {
  const parts = f.split('/');
  return parts.slice(-2).join('/');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

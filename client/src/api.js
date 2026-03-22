/**
 * API client — thin wrappers around fetch()
 */

export async function listMedia({ folder, type, page = 1, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (type)   params.set('type', type);
  params.set('page', page);
  params.set('limit', limit);

  const res = await fetch(`/api/media?${params}`);
  if (!res.ok) throw new Error(`Failed to list media: ${res.status}`);
  return res.json();
}

export async function getMedia(id) {
  const res = await fetch(`/api/media/${id}`);
  if (!res.ok) throw new Error(`Media not found: ${id}`);
  return res.json();
}

export function streamUrl(id) {
  return `/stream/${id}`;
}

export function transcodeUrl(id) {
  return `/transcode/${id}/master.m3u8`;
}

export function thumbnailUrl(id) {
  return `/thumbnail/${id}`;
}

export function downloadUrl(id) {
  return `/download/${id}`;
}

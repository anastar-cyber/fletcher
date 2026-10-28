// Photos stay on this device for now. Each one is cropped to 4:5, scaled down,
// and re-encoded through a canvas, which also strips EXIF metadata (including
// GPS location) before anything is stored.

const DB_NAME = 'fletcher';
const STORE = 'photos';
const MAX_W = 1080;
const RATIO = 4 / 5;

const memory = new Map(); // fallback when IndexedDB is unavailable
const urls = new Map(); // photo id → object URL

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result ?? null);
      t.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers: fall back to an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Center-crop to 4:5, cap the width, and re-encode as JPEG. Throws if the file can't be read. */
export async function processPhoto(file) {
  const src = await decode(file);
  const sw = src.width;
  const sh = src.height;
  let cw = sw;
  let ch = sw / RATIO;
  if (ch > sh) {
    ch = sh;
    cw = sh * RATIO;
  }
  const w = Math.round(Math.min(MAX_W, cw));
  const h = Math.round(w / RATIO);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  src.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.86),
  );
}

export async function putPhoto(id, blob) {
  memory.set(id, blob);
  await tx('readwrite', (s) => s.put(blob, id));
}

/** Object URL for a stored photo, or null if it's gone. */
export async function photoURL(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = memory.get(id) ?? (await tx('readonly', (s) => s.get(id)));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export async function deletePhoto(id) {
  memory.delete(id);
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  await tx('readwrite', (s) => s.delete(id));
}

export async function clearPhotos() {
  memory.clear();
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  await tx('readwrite', (s) => s.clear());
}

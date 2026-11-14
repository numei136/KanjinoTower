/* 漢字の塔 service worker
   - ゲーム本体(HTML)と JSON は「ネット優先」: 更新をすぐ反映し、圏外ならキャッシュで起動
   - 画像・音などは「キャッシュ優先＋裏で更新」: 2回目以降は速く、オフラインでも鳴る
   ゲームを更新したら VERSION を変えると、古いキャッシュが消えます。 */
const VERSION = 'kanji-tower-v6.06';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
const OPTIONAL = ['./info.html'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    await Promise.all(OPTIONAL.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kanji-tower-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await c.match('./index.html') : null);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req, ev) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req);
  const net = fetch(req).then(res => { if (res && res.ok && res.status === 200) c.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { ev.waitUntil(net); return hit; }
  const res = await net;
  return res || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.headers.has('range')) return; // 音声の部分読み込み(Safari)はそのままネットへ
  const html = req.mode === 'navigate' || /\.html?$/.test(url.pathname) || url.pathname.endsWith('/');
  if (html || /\.(json|webmanifest)$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req, e));
});

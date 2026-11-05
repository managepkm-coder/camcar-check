/* 오프라인 지원 — 파일을 고치면 CACHE 버전을 올리세요. */
const CACHE = 'shift-v1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './holidays.js', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('shift-') && k !== CACHE).map((k) => caches.delete(k)))) // 같은 사이트의 보험 앱 캐시는 건드리지 않음
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 네트워크 우선, 실패하면 캐시 (업데이트가 바로 반영되도록)
  e.respondWith(
    fetch(e.request)
      .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

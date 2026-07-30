// Service Worker：app shell 快取 + events.json network-first。
// Lite 版不做 Web Push，這支只負責離線可用性。
const CACHE_NAME = "event-radar-ai-v1";
const CORE_ASSETS = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // events.json：network-first，盡量拿到最新資料，離線時退回快取的舊資料
  if (url.pathname.endsWith("/events.json")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // /api/ai 一律直接打網路，離線時就是失敗（本來就需要即時 AI 回應，快取沒意義）
  if (url.pathname.startsWith("/api/")) return;

  // 其餘資源：cache-first，拿不到才打網路
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

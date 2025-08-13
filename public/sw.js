
const CACHE_NAME = 'tsa-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([
      '/',
      '/manifest.json',
      '/style.css',
      '/client.js',
      OFFLINE_URL
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, networkResponse.clone());
      return networkResponse;
    } catch (err) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      return cached || cache.match(OFFLINE_URL);
    }
  })());
});

'use strict';
// Public UI assets only. Never cache calls, QR credentials, OTP, checkout, or owner pages.
const VERSION = 'qr-call-static-v1';
const PUBLIC = ['/static/styles.css', '/static/icon.svg', '/static/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PUBLIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((n) => n.startsWith('qr-call-static-') && n !== VERSION).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || !PUBLIC.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});

/**
 * 918 Technologies BlockChain BailBonds
 * Service Worker for Progressive Web App
 */

const CACHE_NAME = 'nine1eight-bail-v1';
const OFFLINE_URL = './offline.html';

// Files to cache
const CACHE_FILES = [
  './',
  './index.html',
  './bondsman-portal.html',
  './bail-contract-generator.html',
  './domain-structure.html',
  './domain-wizard.html',
  './style.css',
  './manifest.json',
  './offline.html',
  './script.js',
  './bondsman-actions.js',
  './contract-generator.js',
  './domain-connector.js',
  './ipfs-storage.js',
  './translations.js',
  './oklahoma-data.js',
  './icons/icon-192x192.svg',
  './icons/icon-512x512.svg'
];

// Install event - Cache core files
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing Service Worker...');
  
  // Skip waiting to ensure the new service worker activates immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell and content');
        return cache.addAll(CACHE_FILES);
      })
      .catch(err => {
        console.error('[Service Worker] Error caching app shell and content:', err);
      })
  );
});

// Activate event - Clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating Service Worker...');
  
  // Take control of all clients immediately
  self.clients.claim();
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => {
            return cacheName !== CACHE_NAME;
          }).map(cacheName => {
            console.log('[Service Worker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
  );
});

// Fetch event - Serve from cache, then network with cache update
self.addEventListener('fetch', event => {
  // For IPFS and API requests, don't use cache
  if (event.request.url.includes('ipfs.io') || 
      event.request.url.includes('api.') || 
      event.request.url.includes('infura.io')) {
    return;
  }
  
  // For navigation requests (HTML pages), use network-first strategy
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fetched response
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              
              // If not in cache, serve offline page
              return caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }
  
  // For other requests (CSS, JS, images), use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Return cached response and update cache in the background
          const requestUrl = event.request.url;
          // Don't try to update cache for third-party resources
          if (requestUrl.startsWith(self.location.origin)) {
            fetch(event.request)
              .then(networkResponse => {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, networkResponse.clone());
                });
              })
              .catch(err => console.log('[Service Worker] Error updating cache:', err));
          }
          return cachedResponse;
        }
        
        // If not in cache, fetch from network and cache
        return fetch(event.request)
          .then(response => {
            // Check if response is valid
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response to use it both for cache and to return
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(err => {
            console.log('[Service Worker] Fetch failed:', err);
            
            // For image requests, return a default image if offline
            if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg)$/)) {
              return caches.match('/icons/icon-offline.png');
            }
            
            return new Response('Network request failed');
          });
      })
  );
});

// Push notification event
self.addEventListener('push', event => {
  console.log('[Service Worker] Push received:', event);
  
  let notificationTitle = '918 Bail Alert';
  let notificationOptions = {
    body: 'New bail bond opportunity available',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100, 50, 100],
    data: {
      url: '/bondsman-portal.html'
    }
  };
  
  // Try to extract data from the push event
  if (event.data) {
    try {
      const data = event.data.json();
      notificationTitle = data.title || notificationTitle;
      notificationOptions.body = data.body || notificationOptions.body;
      notificationOptions.data = {
        url: data.url || notificationOptions.data.url
      };
    } catch (e) {
      console.error('[Service Worker] Error parsing push data:', e);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click received');
  
  event.notification.close();
  
  const urlToOpen = event.notification.data && event.notification.data.url
    ? new URL(event.notification.data.url, self.location.origin).href
    : '/bondsman-portal.html';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then(clientList => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // If no window is open, open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync for offline form submissions
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background sync event:', event.tag);
  
  if (event.tag === 'contract-sync') {
    event.waitUntil(
      syncContracts()
        .catch(err => {
          console.error('[Service Worker] Contract sync failed:', err);
        })
    );
  }
});

// Function to sync contracts when back online
async function syncContracts() {
  // Get pending contracts from IndexedDB or localStorage
  try {
    const pendingContractsData = localStorage.getItem('pendingContracts');
    if (!pendingContractsData) return;
    
    const pendingContracts = JSON.parse(pendingContractsData);
    if (!pendingContracts || !pendingContracts.length) return;
    
    console.log('[Service Worker] Syncing pending contracts:', pendingContracts.length);
    
    // Process each pending contract
    for (const contract of pendingContracts) {
      // If window.IPFSStorage is available, store contract in IPFS
      if (typeof window !== 'undefined' && window.IPFSStorage) {
        try {
          const cid = await window.IPFSStorage.storeContractInIPFS(contract, contract.id);
          console.log('[Service Worker] Contract synced to IPFS:', cid);
        } catch (err) {
          console.error('[Service Worker] Failed to sync contract to IPFS:', err);
        }
      }
    }
    
    // Clear pending contracts after successful sync
    localStorage.removeItem('pendingContracts');
    
  } catch (err) {
    console.error('[Service Worker] Error processing pending contracts:', err);
  }
}

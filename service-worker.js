const CACHE_VERSION = 'v5';
const CACHE_NAME = `musicsquare-shell-${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './docs/logo.png',
  './pikachu.gif',
  './icons/app-icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/baloo2-400-latin.woff2',
  './fonts/baloo2-600-latin.woff2',
  './fonts/nunito-400-latin.woff2',
  './fonts/nunito-600-latin.woff2'
];

function toAbsoluteUrl(path) {
  return new URL(path, self.location).toString();
}

function isCacheable(response) {
  return !!(response && response.ok && (response.type === 'basic' || response.type === 'cors' || response.type === 'default'));
}

async function putInCache(request, response) {
  if (!isCacheable(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function putAppShell(response) {
  if (!isCacheable(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(toAbsoluteUrl('./index.html'), response.clone());
  await cache.put(toAbsoluteUrl('./'), response.clone());
}

async function warmAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map(async path => {
    const url = toAbsoluteUrl(path);
    try {
      const response = await fetch(url, { cache: 'reload' });
      if (response && response.ok) {
        await cache.put(url, response.clone());
      }
    } catch (error) {
      // 单个资源失败不阻断整个外壳安装
    }
  }));
}

async function matchAppShell(request) {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match(toAbsoluteUrl('./index.html'))) ||
    (await cache.match(toAbsoluteUrl('./')))
  );
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await warmAppShell();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('musicsquare-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await matchAppShell(request);
      if (cached) {
        if (navigator.onLine) {
          fetch(request)
            .then(putAppShell)
            .catch(() => {});
        }
        return cached;
      }
      try {
        const response = await fetch(request);
        await putAppShell(response);
        return response;
      } catch (error) {
        return new Response('离线且尚未缓存应用外壳', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) {
      if (navigator.onLine) {
        fetch(request)
          .then(response => putInCache(request, response))
          .catch(() => {});
      }
      return cached;
    }

    try {
      const response = await fetch(request);
      await putInCache(request, response);
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const CACHE_NAME = 'manzil-29643e9b20';
const APP_CACHE_PREFIX = 'manzil-';
const APP_SHELL = [
    './',
    './index.html',
    './css/tailwind.css?v=aea143ed99',
    './fonts/cairo.css?v=aecf0ab114',
    './fonts/cairo-v400.woff2?v=01db63ea49',
    './fonts/cairo-v600.woff2?v=5c3c5b28e1',
    './fonts/cairo-v700.woff2?v=d74379269b',
    './fonts/cairo-v900.woff2?v=bb8cb81865',
    './vendor/chart.umd.js?v=c6d8bdd707',
    './vendor/xlsx.full.min.js?v=c9506197ca',
    './vendor/supabase.js?v=8816af04d9',
    './css/style.css?v=436741e8d0',
    './js/sw-register.js?v=27964153c8',
    './js/telemetry.js?v=manzil-29643e9b20',
    './js/state.js?v=e5413f9503',
    './js/access.js?v=74b1d89efb',
    './js/push.js?v=7bd2efa86c',
    './js/render.js?v=48bf50210c',
    './js/crud.js?v=90c5435b73',
    './js/notices.js?v=177b763f9e',
    './js/reports.js?v=905b693c81',
    './js/settings.js?v=86fa26cfed',
    './js/supabase.js?v=7842a0460d',
    './js/cashbox.js?v=630080f12a',
    './js/subscription-rates.js?v=manzil-29643e9b20',
    './js/app.js?v=f3865f81a8',
    './js/monthly-close.js?v=8c90c2c83c',
    './js/backup.js?v=65b179f1d7',
    './js/assistant.js?v=4f0c28e991',
    './js/assistant-voice.js?v=f272543264',
    './js/assistant-groq.js?v=a5ac117af0',
    './js/assistant-avatar-3d.js?v=8b346cf60d',
    './manifest.json?v=3f552df72d',
    './icons/manzil-logo.png?v=94bfc1bbdb',
    './icons/manzil-full-1.png?v=be5105a674',
    './icons/manzil-full-2.png?v=73e8771d9e',
    './icons/manzil-full-3.png?v=114bb1656a',
    './icons/manzil-full-4.png?v=c79f2e7275',
    './icons/manzil-brand.svg?v=0149260cc9',
    './icons/assistant-abbah.png?v=a53ee77e42',
    './icons/assistant-abbah-full.png?v=0e2e887a58',
    './icons/icon-192.png?v=08f7588d14',
    './icons/icon-512.png?v=6f81b225e9'
];

self.addEventListener('install', event => {
    // Atomic pre-caching aborts the whole install when a single asset 404s,
    // which silently pins clients to the previous release. Store what is
    // reachable and let the next update retry the rest.
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(APP_SHELL.map(url => fetch(url, { cache: 'reload' })
                .then(response => (response.ok ? cache.put(url, response) : undefined))
                .catch(() => undefined))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE_NAME)
                .map(key => caches.delete(key))))
        .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // CRITICAL FIX: Pass through ALL cross-origin requests directly.
    // This prevents Service Worker from interfering with CDN font loads
    // (e.g., cdnjs.cloudflare.com/ajax/libs/font-awesome/...).
    // Without this, the fetch handler would intercept and potentially fail
    // on cross-origin requests due to CORS issues.
    if (url.origin !== self.location.origin) {
        event.respondWith(fetch(request));
        return;
    }

    if (request.mode === 'navigate') {
        // GitHub Pages serves HTML with a short max-age; revalidate so a release
        // is visible on the next open instead of after the HTTP cache expires.
        event.respondWith(
            fetch(new Request(request, { cache: 'no-cache' })).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                }
                return response;
            }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
        );
        return;
    }

    // Content-hashed assets carry a "?v=" token that changes whenever the file
    // changes, which makes them immutable: the cached copy is always the newest
    // build for that URL, so it can be served without touching the network.
    if (url.searchParams.has('v')) {
        event.respondWith(
            caches.match(request).then(cached => cached || fetch(request).then(response => {
                if (response.ok && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            }).catch(() => caches.match(request)))
        );
        return;
    }

    event.respondWith(
        fetch(new Request(request, { cache: 'no-cache' })).then(response => {
            if (response.ok && response.type === 'basic') {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
        }).catch(() => caches.match(request))
    );
});

// Web Push handlers (push, notificationclick) live in their own file.
importScripts('./js/push-sw.js');

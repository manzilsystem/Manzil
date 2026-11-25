<<<<<<< HEAD
const CACHE_NAME = 'manzil-9067a45111';
=======
const CACHE_NAME = 'manzil-01243d17e8';
>>>>>>> 74edd40 (Rebuild generated assets after rebase)
const APP_CACHE_PREFIX = 'manzil-';
const APP_SHELL = [
    './',
    './index.html',
<<<<<<< HEAD
    './css/tailwind.css?v=adb54422b2',
=======
    './css/tailwind.css?v=adb54422b2',
>>>>>>> 74edd40 (Rebuild generated assets after rebase)
    './vendor/chart.umd.js?v=c6d8bdd707',
    './vendor/xlsx.full.min.js?v=c9506197ca',
    './vendor/supabase.js?v=8816af04d9',
    './css/style.css?v=8ac09a2377',
    './js/sw-register.js?v=27964153c8',
<<<<<<< HEAD
    './js/telemetry.js?v=manzil-9067a45111',
=======
    './js/telemetry.js?v=manzil-9067a45111',
>>>>>>> 74edd40 (Rebuild generated assets after rebase)
    './js/state.js?v=f367c7dc5c',
    './js/access.js?v=1ca370a57a',
    './js/render.js?v=eea5f1388a',
    './js/crud.js?v=74a52991d9',
    './js/notices.js?v=708550996a',
    './js/reports.js?v=15c9495143',
    './js/settings.js?v=c274fd024a',
    './js/supabase.js?v=66dd8cd5e5',
    './js/cashbox.js?v=630080f12a',
<<<<<<< HEAD
    './js/subscription-rates.js?v=manzil-9067a45111',
=======
    './js/subscription-rates.js?v=manzil-9067a45111',
>>>>>>> 74edd40 (Rebuild generated assets after rebase)
    './js/app.js?v=a3c44d1eab',
    './js/monthly-close.js?v=f589d46a58',
    './js/backup.js?v=65b179f1d7',
    './js/assistant.js?v=272accd4e1',
    './js/assistant-voice.js?v=8983a0aa4e',
    './js/assistant-groq.js?v=a5ac117af0',
    './js/assistant-avatar-3d.js?v=8b346cf60d',
    './manifest.json?v=816dba03f5',
    './icons/manzil-logo.png?v=6ec97fda11',
    './icons/manzil-full-1.png?v=be5105a674',
    './icons/manzil-full-2.png?v=73e8771d9e',
    './icons/manzil-full-3.png?v=114bb1656a',
    './icons/manzil-full-4.png?v=c79f2e7275',
    './icons/manzil-brand.svg?v=d9a5d2deca',
    './icons/assistant-abbah.png?v=a53ee77e42',
    './icons/assistant-abbah-full.png?v=0e2e887a58',
    './icons/icon-192.png?v=6ec97fda11',
    './icons/icon-512.png?v=e3a343d38f'
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
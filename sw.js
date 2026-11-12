const CACHE_NAME = 'manzil-42459f1fd7';
const APP_CACHE_PREFIX = 'manzil-';
const APP_SHELL = [
    './',
    './index.html',
    './css/style.css?v=90a4010689',
    './js/sw-register.js?v=aa29152c50',
    './js/telemetry.js?v=manzil-42459f1fd7',
    './js/state.js?v=6e9bcc8346',
    './js/access.js?v=8e99451163',
    './js/render.js?v=38a35471ba',
    './js/crud.js?v=7a5a5cb848',
    './js/notices.js?v=d2f2b2f5be',
    './js/reports.js?v=3c13e5dfa1',
    './js/settings.js?v=c274fd024a',
    './js/supabase.js?v=8449ca5367',
    './js/cashbox.js?v=3ca9f6a1d8',
    './js/subscription-rates.js?v=manzil-42459f1fd7',
    './js/app.js?v=27a807c306',
    './js/monthly-close.js?v=bab5545096',
    './js/backup.js?v=6f6d4ebbf1',
    './js/assistant.js?v=b06754edc0',
    './manifest.json?v=c17eb7e5e2',
    './icons/manzil-logo.png?v=9751c575fe',
    './icons/manzil-full-1.png?v=be5105a674',
    './icons/manzil-full-2.png?v=73e8771d9e',
    './icons/manzil-full-3.png?v=114bb1656a',
    './icons/manzil-full-4.png?v=c79f2e7275',
    './icons/manzil-brand.svg?v=d9a5d2deca',
    './icons/assistant-abbah.png?v=f00447602d',
    './icons/assistant-abbah-full.png?v=1f40df6bdd',
    './icons/icon-192.png?v=9751c575fe',
    './icons/icon-512.png?v=bd1ed5974d'
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
    if (url.origin !== self.location.origin) {
        event.respondWith(fetch(request).catch(() => caches.match(request)));
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

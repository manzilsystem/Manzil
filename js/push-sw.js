// Web Push handlers, loaded into the service worker with importScripts('./js/push-sw.js').
// The payload is JSON made by the send-push Edge Function: {id, title, body, path, buildingId}.
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (_error) { data = {}; }
    const title = String(data.title || 'منزل');
    const options = {
        body: String(data.body || ''),
        icon: './icons/icon-192.png',
        badge: './icons/favicon-48.png',
        dir: 'rtl',
        lang: 'ar',
        // Same tag replaces an earlier copy of the same notification instead of stacking.
        tag: data.id ? `manzil-${data.id}` : undefined,
        data: { path: String(data.path || ''), id: data.id || '' }
    };
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Every open window refetches its list: the realtime socket can be frozen in the background.
            clients.forEach(client => client.postMessage({ type: 'manzil-push-received', id: data.id || '' }));
            // The open, visible app shows the notification in its list, so no system popup on top of it.
            if (clients.some(client => client.visibilityState === 'visible')) return undefined;
            return self.registration.showNotification(title, options);
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const path = String((event.notification.data && event.notification.data.path) || '');
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            const existing = clients.find(client => 'focus' in client);
            if (existing) {
                existing.postMessage({ type: 'manzil-push-open', path });
                return existing.focus();
            }
            return self.clients.openWindow('./').then(client => {
                if (client) client.postMessage({ type: 'manzil-push-open', path });
            });
        })
    );
});

(() => {
    const RELEASE = 'manzil-v120';
    const STORAGE_KEY = 'manzil-error-log';
    const MAX_STORED = 20;
    const MAX_SENT = 10;
    const MAX_MESSAGE = 300;
    const MAX_STACK = 1200;
    const seen = new Set();
    const pending = [];
    let sent = 0;

    const trim = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

    function readStored() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function errorSummary(payload) {
        if (!payload) return '';
        if (typeof payload === 'string') return payload;
        return payload.message || payload.reason?.message || payload.error?.message || payload.reason || '';
    }

    function sanitize(payload, kind) {
        const error = payload?.error || payload?.reason || payload;
        return {
            kind,
            message: trim(errorSummary(payload), MAX_MESSAGE),
            source: trim(String(payload?.filename || '').split('/').pop(), 80),
            line: Number(payload?.lineno) || null,
            column_number: Number(payload?.colno) || null,
            stack: trim(error?.stack || payload?.reason?.stack || '', MAX_STACK),
            role: trim(window.currentUserRole || 'anonymous', 20),
            release: RELEASE,
            path: trim(location.pathname, 120),
            created_at: new Date().toISOString()
        };
    }

    function persist(entry) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...readStored(), entry].slice(-MAX_STORED)));
        } catch {
            // Storage can be unavailable in private browsing; reporting must never break the app.
        }
    }

    function endpoint() {
        const config = window.manzilSupabaseConfig;
        if (!config?.url || !config?.key) return null;
        return {
            url: `${config.url}/rest/v1/client_errors`,
            headers: {
                apikey: config.key,
                Authorization: `Bearer ${config.key}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            }
        };
    }

    function transmit(entry) {
        const target = endpoint();
        if (!target) {
            pending.push(entry);
            return;
        }
        try {
            fetch(target.url, {
                method: 'POST',
                keepalive: true,
                headers: target.headers,
                body: JSON.stringify(entry)
            }).catch(() => {});
        } catch {
            // A failed report must never surface as an app error.
        }
    }

    function report(payload, kind) {
        try {
            const entry = sanitize(payload, kind);
            if (!entry.message) return;
            const signature = `${entry.kind}|${entry.message}`;
            if (seen.has(signature)) return;
            seen.add(signature);
            persist(entry);
            send(entry);
        } catch {
            // Swallow: telemetry must never throw.
        }
    }

    function send(entry) {
        if (sent >= MAX_SENT) return;
        sent += 1;
        // Local development and the E2E suite keep entries in localStorage only.
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
        transmit(entry);
    }

    function flush() {
        if (!endpoint()) return;
        while (pending.length) transmit(pending.shift());
    }

    window.addEventListener('error', event => {
        if (!event.message) return;
        report(event, 'error');
    }, true);
    window.addEventListener('unhandledrejection', event => report(event, 'rejection'));
    window.addEventListener('load', flush);
    window.manzilReportError = message => report(message, 'manual');
    window.manzilErrorLog = () => readStored();
})();

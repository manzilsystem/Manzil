// @ts-check
// عم عبده — Groq bridge. The deterministic engine in assistant.js computes
// every number and every permission decision first. Groq only rephrases an
// approved read-only answer; it never invents data or executes an action.
// The key lives in a Supabase Edge Function (production) or the local dev
// proxy (localhost). The browser never sees the Groq host or the key.

const ASSISTANT_GROQ_ALLOWED_IDS = new Set([
    'summary', 'executive', 'change_alerts', 'income', 'expenses', 'cashbox',
    'arrears', 'adjustments', 'recent', 'resident', 'building', 'reports',
    'comparison', 'payment_breakdown', 'top_expenses', 'compound',
    'my_bill', 'my_receipts', 'my_due_date', 'payment_methods',
    'my_notifications', 'notices', 'my_adjustments', 'my_apartment'
]);

const ASSISTANT_GROQ_FUNCTION_PATH = '/functions/v1/assistant-groq';

function assistantGroqIsLocalHost(hostname) {
    return /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(String(hostname || ''));
}

function assistantGroqCanRewrite(answer) {
    return Boolean(answer && typeof answer === 'object'
        && ASSISTANT_GROQ_ALLOWED_IDS.has(answer.id)
        && typeof answer.html === 'string' && answer.html.trim());
}

function assistantGroqPlainText(html, doc) {
    const holder = doc.createElement('div');
    holder.innerHTML = String(html || '');
    return String(holder.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
}

function assistantGroqEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function assistantGroqEndpoint() {
    const hostname = globalThis.location && globalThis.location.hostname;
    if (assistantGroqIsLocalHost(hostname)) return { local: true, url: '' };
    const config = /** @type {{ url?: string } | undefined} */ (globalThis.manzilSupabaseConfig);
    const base = typeof config?.url === 'string' ? config.url.trim().replace(/\/+$/, '') : '';
    if (!base) return null;
    return { local: false, url: base + ASSISTANT_GROQ_FUNCTION_PATH };
}

async function assistantGroqAuthHeaders(endpoint) {
    const headers = { Accept: 'application/json' };
    if (endpoint.local) return headers;
    try {
        const client = /** @type {any} */ (typeof supabaseClient !== 'undefined'
            ? supabaseClient : globalThis.supabaseClient);
        const session = client?.auth?.getSession ? await client.auth.getSession() : null;
        const token = String(session?.data?.session?.access_token || '');
        if (token) headers.Authorization = `Bearer ${token}`;
    } catch (error) {
        // The function will answer 401 and the caller falls back to local.
    }
    return headers;
}

async function assistantGroqPost(endpoint, payload, localPath) {
    const headers = { ...await assistantGroqAuthHeaders(endpoint), 'Content-Type': 'application/json' };
    const response = await fetch(endpoint.local ? localPath : endpoint.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}

function assistantGroqMarkLocalStatus(doc, enabled) {
    if (!enabled) return;
    const note = doc.querySelector('.assistant-head-copy > p');
    if (!note) return;
    const textNode = [...note.childNodes].find(node => node.nodeType === 3);
    if (textNode) textNode.nodeValue = ' متاح الآن · صياغة Groq محلية';
}

const assistantGroqConfiguredEndpoint = (typeof document !== 'undefined' && typeof fetch === 'function')
    ? assistantGroqEndpoint()
    : null;

if (assistantGroqConfiguredEndpoint) {
    const endpoint = assistantGroqConfiguredEndpoint;
    const installHook = () => {
        globalThis.assistantGroqAnswer = async function assistantGroqAnswer(text, localAnswer) {
            if (!assistantGroqCanRewrite(localAnswer)) return null;
            const facts = assistantGroqPlainText(localAnswer.html, document);
            if (!facts) return null;
            const role = typeof currentUserRole !== 'undefined' ? currentUserRole : 'manager';
            const data = await assistantGroqPost(endpoint, {
                action: 'chat',
                answerId: localAnswer.id,
                question: String(text || '').slice(0, 1000),
                facts,
                role
            }, '/api/groq/chat').catch(() => null);
            if (!data) return null;
            const content = typeof data.content === 'string' ? data.content.trim() : '';
            if (!content || content.length > 4000) return null;
            return {
                id: localAnswer.id,
                title: localAnswer.title,
                html: `<p class="assistant-groq-text">${assistantGroqEscape(content).replace(/\n/g, '<br>')}</p>`
                    + '<p class="assistant-note">صياغة ذكية باللهجة المصرية · الأرقام من بيانات التطبيق.</p>',
                followUps: localAnswer.followUps,
                source: 'groq'
            };
        };

        globalThis.assistantGroqTranscribe = async function assistantGroqTranscribe(audio) {
            if (!audio || typeof audio.arrayBuffer !== 'function' || typeof FormData === 'undefined') return '';
            try {
                const form = new FormData();
                form.append('action', 'transcribe');
                form.append('audio', audio, 'voice.webm');
                const headers = await assistantGroqAuthHeaders(endpoint);
                const url = endpoint.local ? '/api/groq/transcribe' : endpoint.url;
                const response = await fetch(url, { method: 'POST', headers, body: form });
                if (!response.ok) return '';
                const data = await response.json();
                return typeof data?.text === 'string' ? data.text.trim().slice(0, 1000) : '';
            } catch (error) {
                return '';
            }
        };
    };

    if (endpoint.local) {
        const health = fetch('/api/groq/health', { headers: { Accept: 'application/json' }, cache: 'no-store' })
            .then(response => response.ok ? response.json() : null)
            .then(data => {
                const enabled = Boolean(data && data.enabled);
                if (enabled) {
                    assistantGroqMarkLocalStatus(document, true);
                    installHook();
                }
                return enabled;
            })
            .catch(() => false);
        globalThis.assistantGroqHealth = health;
    } else {
        // Production: no extra health round trip. A failed call simply falls
        // back to the local deterministic answer.
        installHook();
        globalThis.assistantGroqHealth = Promise.resolve(true);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ASSISTANT_GROQ_ALLOWED_IDS,
        ASSISTANT_GROQ_FUNCTION_PATH,
        assistantGroqIsLocalHost,
        assistantGroqCanRewrite,
        assistantGroqPlainText,
        assistantGroqEscape,
        assistantGroqEndpoint
    };
}

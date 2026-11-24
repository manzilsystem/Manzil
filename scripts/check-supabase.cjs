'use strict';

// فحص حي خفيف لربط الواجهة بمشروع Supabase المستضاف.
// يقرأ URL والمفتاح العام من js/supabase.js فقط؛ لا يقرأ أي ملف أسرار ولا يطبع المفتاح.
// الاستعمال: npm run check:supabase [-- --strict]
//   --strict يجعل تحذيرات الدوال غير المنشورة فاشلة (مناسب بعد نشر health).
// فحص owner-login إلزامي: يرسل OPTIONS بدون مفتاح للتأكد أن verify_jwt = false.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TIMEOUT_MS = 15000;

const CHECKS = [
    {
        id: 'auth',
        label: 'GoTrue /auth/v1/health',
        path: '/auth/v1/health',
        sendKey: true,
        expected: [200],
        hint: 'خدمة المصادقة غير متاحة؛ راجع حالة المشروع في لوحة Supabase.',
    },
    {
        id: 'rest',
        label: 'PostgREST /rest/v1/',
        path: '/rest/v1/',
        sendKey: true,
        expected: [200, 401],
        hint: 'PostgREST لا يستجيب؛ راجع حالة قاعدة البيانات في لوحة Supabase.',
    },
    {
        id: 'rls',
        label: 'عزل anon عن public.buildings',
        path: '/rest/v1/buildings?select=id&limit=1',
        sendKey: true,
        expected: [401, 403],
        hint: 'تعذر تأكيد رفض القراءة العامة؛ راجع سياسات RLS والمنح.',
        securityHint: 'المفتاح العام يقرأ buildings — راجع RLS وGRANT فورًا.',
    },
    {
        id: 'health',
        label: 'Edge Function /functions/v1/health',
        path: '/functions/v1/health',
        method: 'GET',
        sendKey: false,
        expected: [200],
        optional: true,
        hint: 'الدالة غير منشورة أو تتطلب JWT؛ انشر health بـverify_jwt = false.',
    },
    {
        id: 'owner-login',
        label: 'Edge Function /functions/v1/owner-login preflight without JWT',
        path: '/functions/v1/owner-login',
        method: 'OPTIONS',
        sendKey: false,
        expected: [200],
        hint: 'طلب OPTIONS بدون JWT مرفوض؛ تحقق من verify_jwt = false على المشروع المستضاف.',
    },
];

function readPublicConfig(root = ROOT) {
    const source = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
    const urlMatch = /const SUPABASE_URL = '([^']+)'/.exec(source);
    const keyMatch = /const SUPABASE_PUBLISHABLE_KEY = (.*);/.exec(source);

    if (!urlMatch || !keyMatch) {
        throw new Error('تعذر قراءة Supabase URL والمفتاح العام من js/supabase.js');
    }

    // المفتاح مكتوب على شكل 'sb_publishable_' + '...' في الملف؛ نعيد تجميعه للاستخدام فقط.
    const key = keyMatch[1]
        .split('+')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .join('');

    if (!key) throw new Error('المفتاح العام فارغ في js/supabase.js');
    return { url: urlMatch[1].replace(/\/+$/, ''), key };
}

function evaluate(check, status) {
    if (check.expected.includes(status)) {
        return { state: 'OK', detail: `HTTP ${status}` };
    }

    if (check.id === 'rls' && status >= 200 && status < 300) {
        return { state: 'FAIL', detail: `HTTP ${status} — ${check.securityHint}` };
    }

    if (check.optional) {
        return { state: 'WARN', detail: `HTTP ${status} — ${check.hint}` };
    }

    return { state: 'FAIL', detail: `HTTP ${status} — ${check.hint}` };
}

async function runChecks(config, fetchImpl = fetch, checks = CHECKS) {
    const results = [];

    for (const check of checks) {
        let result;
        try {
            const response = await fetchImpl(config.url + check.path, {
                method: check.method || 'GET',
                headers: check.sendKey ? { apikey: config.key } : {},
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            result = evaluate(check, response.status);
            await response.text();
        } catch (error) {
            result = check.optional
                ? { state: 'WARN', detail: `${error.name}: ${error.message}` }
                : { state: 'FAIL', detail: `${error.name}: ${error.message}` };
        }
        results.push({ check, result });
    }

    return results;
}

async function main() {
    const strict = process.argv.includes('--strict');
    const config = readPublicConfig();

    console.log(`Supabase: ${config.url}`);
    console.log(`Publishable key: present (${config.key.length} chars) — not printed`);

    const results = await runChecks(config);
    let failures = 0;
    let warnings = 0;

    for (const { check, result } of results) {
        console.log(`${result.state} ${check.label}: ${result.detail}`);
        if (result.state === 'FAIL') failures += 1;
        if (result.state === 'WARN') warnings += 1;
    }

    console.log(`Summary: ${failures} failed, ${warnings} warning(s)${strict ? ' (strict)' : ''}`);
    process.exitCode = failures > 0 || (strict && warnings > 0) ? 1 : 0;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`check:supabase: ${error.message}`);
        process.exitCode = 2;
    });
}

module.exports = { CHECKS, evaluate, readPublicConfig, runChecks };

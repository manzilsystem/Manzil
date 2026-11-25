const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const supabase = fs.readFileSync('js/supabase.js', 'utf8');

test('sign-in screen preserves authentication hooks and explains owner PIN provisioning', () => {
    assert.match(html, /onsubmit="submitSupabaseLogin\(event\)"/);
    assert.match(html, /id="authIdentifier"/);
    assert.match(html, /id="authPassword"/);
    assert.match(html, /aria-labelledby="ownerPinHelpTitle"/);
    assert.match(html, /حساب المالك لا يُنشأ من شاشة الدخول/);
    assert.match(html, /حفظ الشقة وإنشاء \/ إعادة ضبط PIN المالك/);
    assert.match(html, /PIN دائمًا من 6 أرقام/);
    assert.match(html, /<details id="ownerLoginHelp"/);
    assert.match(html, /يفتح الزر رسالة جاهزة إلى الإدارة فقط/);
});

test('sign-in screen separates manager and owner credentials and instructions', () => {
    assert.match(html, /id="loginModeManager"[^>]*onclick="setLoginMode\('manager'\)"/);
    assert.match(html, /id="loginModeOwner"[^>]*onclick="setLoginMode\('owner'\)"/);
    assert.match(html, /<i class="fa-solid fa-building-user"[^>]*><\/i> مدير المبنى/);
    assert.match(html, /<i class="fa-solid fa-house-user"[^>]*><\/i> مالك الشقة/);
    assert.match(html, /id="authIdentifierLabel"[^>]*>البريد الإلكتروني للمدير/);
    assert.match(html, /id="authPasswordLabel"[^>]*>كلمة مرور المدير/);
    assert.match(html, /id="ownerLoginHelp" class="auth-owner-help hidden/);
    assert.match(html, /id="managerRecoveryBtn"[^>]*onclick="requestManagerPasswordReset\(\)"/);
    assert.match(html, /نسيت كلمة مرور المدير/);
    assert.match(supabase, /function setLoginMode\(mode\)/);
    assert.match(supabase, /PIN المالك يجب أن يتكون من 6 أرقام أو 8 أرقام للرمز المؤقت/);
    assert.match(supabase, /function requestManagerPasswordReset\(\)/);
});

test('company ownership and contact details appear on sign-in and in the app', () => {
    assert.equal((html.match(/id="appCopyright"/g) || []).length, 1);
    assert.equal((html.match(/حقوق الملكية الفكرية © 2026 شركة سنا للبرمجيات/g) || []).length, 2);
    assert.equal((html.match(/href="tel:\+201027767039"/g) || []).length, 2);
    assert.match(html, /محمد عادل/);
    assert.match(html, /meta name="author" content="شركة سنا للبرمجيات/);
});

test('the redesigned sign-in shell collapses and prioritizes the form on mobile', () => {
    assert.ok(css.includes('#pinLockModal > .auth-shell {') && css.includes('max-width:72rem'));
    assert.match(css, /@media \(max-width:700px\)[\s\S]*?#pinLockModal > \.auth-shell \{ grid-template-columns:minmax\(0,1fr\)/);
    assert.match(css, /@media \(max-width:700px\)[\s\S]*?\.auth-brand-panel \{ order:1/);
    assert.match(css, /@media \(max-width:700px\)[\s\S]*?\.auth-login-panel \{ order:2/);
});

test('sign-in copy no longer carries superseded fallback rules', () => {
    assert.doesNotMatch(css, /\.auth-brand-panel > div:first-child > p\s*\{/);
    assert.doesNotMatch(css, /--auth-ink-secondary\s*:/);
    assert.doesNotMatch(css, /\.auth-trust-note i\s*\{\s*color:\s*#a5b4fc\s*;\s*\}/);
    assert.doesNotMatch(css, /\.auth-rights\s*\{\s*color:\s*#94a3b8\s*;\s*\}/);
    assert.match(css, /#pinLockModal \.auth-trust-note i\s*\{\s*color:\s*var\(--auth-ink-trust-icon\)\s*;\s*\}/);

    const trustNoteRules = [...css.matchAll(/(?:^|\n)\.auth-trust-note\s*\{([^}]*)\}/g)];
    assert.equal(trustNoteRules.length, 1, 'expected only the current trust note base rule');
    assert.match(trustNoteRules[0][1], /line-height:\s*var\(--leading-170\)/);
    assert.match(css, /#pinLockModal \.auth-brand-description \{ color:var\(--auth-ink-soft\);/);
    assert.match(css, /#pinLockModal \.auth-trust-note \{ color:var\(--auth-ink-soft\);/);
    assert.match(css, /\.auth-rights \{ color:var\(--text-muted\); font-size:var\(--font-62\); line-height:var\(--leading-180\); \}/);
    assert.match(css, /#pinLockModal \.auth-rights \{ color:var\(--auth-ink-dim\); \}/);
    assert.match(css, /@media \(max-width:700px\)[\s\S]*?\.auth-brand-benefits,\.auth-trust-note \{ display:none/);
});

test('Manzil branding uses the supplied logo on sign-in and app header with responsive styling', () => {
    assert.ok(html.includes('class="auth-logo-frame manzil-full-logo" role="img" aria-label="شعار منزل | Manzil"'));
    assert.ok(html.includes('icons/manzil-brand.png'));
    assert.ok(html.includes('class="header-brand-mark" aria-hidden="true"><img src="icons/manzil-logo.png?v='));
    assert.doesNotMatch(html, /<svg class="w-6 h-6" viewBox="0 0 24 24"/);
    assert.ok(css.includes('background:transparent !important'));
    assert.ok(css.includes('grid-template-columns:minmax(16rem,.72fr) minmax(0,1.28fr)'));
    assert.ok(css.includes('@media (min-width:701px)'));
    assert.ok(css.includes('object-fit:contain'));
    assert.ok(css.includes('width:min(100%,15rem)'));
});
 
test('Manzil login uses the gold and turquoise visual identity with a mobile-first layout', () => {
    assert.ok(css.includes('linear-gradient(145deg,var(--auth-surface-brand-1) 0%,var(--auth-surface-brand-2) 54%,var(--auth-surface-brand-3) 100%)'));
    assert.ok(css.includes('linear-gradient(110deg,#a97827 0%,#f1ce7d 48%,#b78332 100%)'));
    assert.ok(css.includes('#pinLockModal .auth-login-panel { order:2'));
    assert.ok(html.includes('aria-label="شعار منزل | Manzil"'));
    assert.ok(!html.includes('<h1>منزل <span lang="en">MANZIL</span></h1>'));
});

test('auth-rights link style is separated from appCopyright link and both resolve correctly', () => {
    // The old combined rule ".auth-rights a, #appCopyright a { color: #c7d2fe; … }" applied
    // an indigo literal to .auth-rights a which was immediately overridden by the later rule
    // ".auth-rights a { color: var(--accent-color); … }". Splitting them removes the dead
    // declaration on .auth-rights a while keeping the #appCopyright a style intact.

    // 1. The combined selector must be gone.
    assert.doesNotMatch(
        css,
        /\.auth-rights a,\s*#appCopyright a/,
        'the combined ".auth-rights a, #appCopyright a" rule must have been split'
    );

    // 2. #appCopyright a carries its color via the canonical indigo-link token (not a raw literal).
    assert.match(
        css,
        /#appCopyright a \{ color: var\(--indigo-link\);/,
        '#appCopyright a must declare color: var(--indigo-link) in its own rule'
    );

    // 3. #appCopyright a layout rule is preserved.
    assert.match(
        css,
        /#appCopyright a \{ display: inline-flex; align-items: center; min-height: 24px; padding-inline: var\(--space-20\); \}/,
        '#appCopyright a layout rule must be preserved'
    );

    // 4. .auth-rights a continues to resolve from the accent token (not a stale indigo literal).
    assert.match(
        css,
        /\.auth-rights a \{ color:var\(--accent-color\)/,
        '.auth-rights a must consume var(--accent-color)'
    );

    // 5. Inside #pinLockModal, .auth-rights a uses the gold brand token (not the accent).
    assert.match(
        css,
        /#pinLockModal \.auth-rights a \{ color:#e9c16d/,
        '#pinLockModal .auth-rights a must use the gold literal #e9c16d'
    );
});

test('brand icons are transparent PNGs and the manifest has real maskable icons', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const pngInfo = file => {
        const b = fs.readFileSync(path.join(root, file));
        return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
    };
    for (const file of ['icons/manzil-brand.png', 'icons/manzil-logo.png', 'icons/icon-192.png', 'icons/icon-512.png']) {
        const info = pngInfo(file);
        assert.equal(info.colorType, 6, `${file} must be RGBA`);
        assert.equal(info.w, info.h);
    }
    assert.equal(pngInfo('icons/icon-maskable-512.png').w, 512);
    assert.equal(pngInfo('icons/apple-touch-icon.png').w, 180);
    assert.ok(fs.existsSync(path.join(root, 'favicon.ico')));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.orientation, 'any');
    const maskable = manifest.icons.filter(icon => icon.purpose === 'maskable').map(icon => icon.src);
    assert.deepEqual(maskable.sort(), ['icons/icon-maskable-192.png', 'icons/icon-maskable-512.png']);
    for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert.match(css, /\.header-brand-mark \{[^}]*background:transparent/);
    assert.match(css, /\.auth-logo-frame \{[^}]*background:transparent/);
});

test('light theme gives the transparent logo a contrast filter on header, login and settings', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
    assert.match(css, /\[data-theme="light"\] \.header-brand-mark img,\s*\[data-theme="light"\] \.auth-logo-frame img,\s*\[data-theme="light"\] \.settings-brand-mark \{ filter: saturate\(1\.25\)/);
});

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

test('Manzil branding uses the supplied logo on sign-in and app header with responsive styling', () => {
    assert.match(html, /class="auth-logo-frame manzil-full-logo" role="img" aria-label="شعار منزل \\| Manzil"/);
    for (const strip of [1, 2, 3, 4]) assert.ok(html.includes(`icons/manzil-full-${strip}.png`));
    assert.match(html, /class="header-brand-mark"[^>]*>[\s\S]*?src="icons\/manzil-logo\.png"/);
    assert.doesNotMatch(html, /<svg class="w-6 h-6" viewBox="0 0 24 24"/);
    assert.ok(css.includes('background:transparent !important'));
    assert.match(css, /grid-template-columns:minmax\\(16rem,\\.72fr\\) minmax\\(0,1\\.28fr\\)/);
    assert.match(css, /@media \\(max-width:700px\\)[\\s\\S]*?#pinLockModal > \\.auth-shell \\{[^{]*grid-template-columns:minmax\\(0,1fr\\)/);
    assert.ok(css.includes('grid-template-rows:repeat(4,minmax(0,1fr))'));
    assert.ok(css.includes('width:min(100%,15rem)'));
    assert.match(css, /@media \\(max-width:700px\\)[\\s\\S]*?#pinLockModal > \\.auth-shell \\{[^{]*grid-template-columns:minmax\\(0,1fr\\)/);
});


test('Manzil login uses the gold and turquoise visual identity with a mobile-first layout', () => {
    assert.ok(css.includes('linear-gradient(145deg,#02080d 0%,#071c27 54%,#061018 100%)'));
    assert.ok(css.includes('linear-gradient(110deg,#a97827 0%,#f1ce7d 48%,#b78332 100%)'));
    assert.ok(css.includes('#pinLockModal .auth-login-panel { order:2'));
    assert.ok(html.includes('<h1>منزل <span lang="en">MANZIL</span></h1>'));
});

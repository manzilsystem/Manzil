const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

test('sign-in screen preserves authentication hooks and explains owner PIN provisioning', () => {
    assert.match(html, /onsubmit="submitSupabaseLogin\(event\)"/);
    assert.match(html, /id="authIdentifier"/);
    assert.match(html, /id="authPassword"/);
    assert.match(html, /aria-labelledby="ownerPinHelpTitle"/);
    assert.match(html, /حساب المالك لا يُنشأ من شاشة الدخول/);
    assert.match(html, /حفظ الشقة وإنشاء \/ إعادة ضبط PIN المالك/);
    assert.match(html, /PIN جديدًا عند أول دخول/);
});

test('company ownership and contact details appear on sign-in and in the app', () => {
    assert.equal((html.match(/id="appCopyright"/g) || []).length, 1);
    assert.equal((html.match(/حقوق الملكية الفكرية © 2026 شركة سنا للبرمجيات/g) || []).length, 2);
    assert.equal((html.match(/href="tel:\+201027767039"/g) || []).length, 2);
    assert.match(html, /محمد عادل/);
    assert.match(html, /meta name="author" content="شركة سنا للبرمجيات/);
});

test('the redesigned sign-in shell collapses and prioritizes the form on mobile', () => {
    assert.match(css, /#pinLockModal > \.auth-shell\s*\{[^}]*grid-template-columns: minmax\(0, \.95fr\)/s);
    const mobileMediaIndex = css.indexOf('@media (max-width: 640px) {');
    const mobileAuthRuleIndex = css.indexOf('#pinLockModal > .auth-shell { grid-template-columns: minmax(0, 1fr);', mobileMediaIndex);
    const brandOrderIndex = css.indexOf('.auth-brand-panel { order: 2;', mobileMediaIndex);
    const loginOrderIndex = css.indexOf('.auth-login-panel { order: 1;', mobileMediaIndex);
    const nextMediaIndex = css.indexOf('@media (max-width: 360px)', mobileMediaIndex);
    assert.ok(mobileMediaIndex >= 0 && mobileAuthRuleIndex > mobileMediaIndex && mobileAuthRuleIndex < nextMediaIndex);
    assert.ok(brandOrderIndex > mobileMediaIndex && brandOrderIndex < nextMediaIndex);
    assert.ok(loginOrderIndex > mobileMediaIndex && loginOrderIndex < nextMediaIndex);
});

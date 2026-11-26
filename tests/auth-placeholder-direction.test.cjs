const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const supabase = read('js/supabase.js');

// Arabic placeholders inside dir="ltr" inputs are reordered by the bidi
// algorithm (a leading "6" in the owner PIN hint jumped into the middle of the
// sentence). RTL direction keeps the hint's word order; typed values stay
// left-aligned through the existing text-left class and render correctly
// because Latin and digit runs keep their own direction.
test('sign-in credential inputs carry rtl direction so Arabic hints keep their order', () => {
    assert.match(html, /id="authIdentifier"[^>]*dir="rtl"/);
    assert.match(html, /id="authPassword"[^>]*dir="rtl"/);
    assert.doesNotMatch(html, /id="authIdentifier"[^>]*dir="ltr"/);
    assert.doesNotMatch(html, /id="authPassword"[^>]*dir="ltr"/);
});

test('owner PIN change inputs carry rtl direction and normal placeholder tracking', () => {
    assert.match(html, /id="currentOwnerPin"[^>]*dir="rtl"/);
    assert.match(html, /id="newOwnerPin"[^>]*dir="rtl"/);
    assert.match(html, /id="confirmOwnerPin"[^>]*dir="rtl"/);
    // The wide tracking is for the typed digits only; the Arabic placeholder
    // letters must stay joined.
    assert.match(css, /#ownerPinChangeModal input::placeholder \{\s*letter-spacing:var\(--tracking-1\);\s*\}/);
    // Typed PIN digits keep their wide tracking.
    assert.match(html, /id="currentOwnerPin"[^>]*tracking-\[0\.5em\]/);
});

test('owner PIN hint copy still explains the 6 vs 8 digit rule', () => {
    assert.match(supabase, /6 أرقام دائم أو 8 أرقام مؤقت/);
    assert.match(supabase, /PIN المالك يجب أن يتكون من 6 أرقام أو 8 أرقام للرمز المؤقت/);
});

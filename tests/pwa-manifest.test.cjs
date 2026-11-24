const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('the manifest keeps the required install fields and icon sizes', () => {
    assert.equal(manifest.name.includes('منزل'), true);
    assert.ok(manifest.short_name);
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.lang, 'ar');
    assert.equal(manifest.dir, 'rtl');
    assert.deepEqual(
        manifest.icons.filter(icon => icon.purpose === 'any').map(icon => icon.sizes),
        ['192x192', '512x512']
    );
    for (const icon of manifest.icons) {
        assert.equal(icon.type, 'image/png');
        assert.ok(fs.existsSync(path.join(root, icon.src)), `${icon.src} must exist for installation`);
    }
});

test('the install splash color matches the default dark theme background', () => {
    const css = read('css/style.css');
    const darkTheme = css.match(/\[data-theme="dark"\] \{[^}]*\}/);
    assert.ok(darkTheme, 'expected the dark theme token block');
    const background = darkTheme[0].match(/--bg-main:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(background, 'expected --bg-main in the dark theme token block');
    assert.equal(manifest.background_color.toLowerCase(), background[1].toLowerCase(),
        'a light splash over the default dark app flashes on install');
});

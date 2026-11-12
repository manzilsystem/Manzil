const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const avatar = read('js/assistant-avatar-3d.js');
const modal = read('src/partials/modals.html');
const template = read('src/index.template.html');
const html = read('index.html');
const sw = read('sw.js');
const build = read('scripts/build-index.mjs');
const ignore = read('.gitignore');

test('the 3D viewer, the speech runtime and their licenses are committed', () => {
    const viewerPath = path.join(root, 'js', 'vendor', 'model-viewer.min.js');
    assert.ok(fs.statSync(viewerPath).size > 500_000, 'the vendored viewer must be the full build');
    assert.match(read('js/vendor/model-viewer.min.js'), /customElements\.define\("model-viewer"/);
    assert.match(read('js/vendor/model-viewer-LICENSE.txt'), /Apache License/);
    assert.match(ignore, /^js\/vendor\/\*$/m);
    assert.match(ignore, /^!js\/vendor\/model-viewer\.min\.js$/m);
    assert.match(ignore, /^!js\/vendor\/model-viewer-LICENSE\.txt$/m);
    for (const asset of [
        'onnxruntime-web.min.js',
        'onnxruntime-web-LICENSE.txt',
        'ort-wasm-simd-threaded.mjs',
        'ort-wasm-simd-threaded.wasm',
        'egyptian-arabic-wav2vec2-LICENSE.txt'
    ]) {
        assert.match(ignore, new RegExp(`^!js/vendor/${asset.replace(/\./g, '\\.')}$`, 'm'), `${asset} must be committed`);
    }
    assert.ok(!ignore.match(/^js\/assistant-voice\.js$/m), 'the voice module must be committed');
    assert.match(ignore, /^docs\/assistant-local-ai-evaluation\.md$/m, 'model weights and evaluations stay local');
    assert.ok(!ignore.match(/^js\/vendor\/$/m), 'the whole vendor directory must not be ignored anymore');
});

test('every committed runtime participates in the release fingerprint', () => {
    assert.ok(!build.includes("'js/vendor',"), 'the vendor directory must not be skipped as a whole');
    assert.ok(!build.includes('EXCLUDED_PATHS'), 'no committed asset may be dropped from the digest');
    assert.ok(!build.includes('onnxruntime-web.min.js?v='), 'the runtime URL must stay lazy, not stamped into the shell');
});

test('the avatar module is valid JavaScript and never reaches a remote origin', () => {
    assert.doesNotThrow(() => new vm.Script(avatar, { filename: 'assistant-avatar-3d.js' }));
    assert.doesNotMatch(avatar, /https?:\/\//, 'the avatar must not load anything from a remote origin');
    assert.doesNotMatch(avatar, /\bfetch\s*\(/, 'static assets load through the element, not ad-hoc requests');
    assert.ok(avatar.includes("MODEL_URL = 'icons/assistant-abbah-3d-rigged.glb'"));
    assert.ok(avatar.includes("VIEWER_MODULE = './vendor/model-viewer.min.js'"));
    assert.ok(avatar.includes('import(specifier)'), 'the viewer bundle must stay lazy');
});

test('the module waits for the modal, pauses on close and degrades to the still portrait', () => {
    assert.ok(avatar.includes('MutationObserver'));
    assert.ok(avatar.includes("attributeFilter: ['class']"));
    assert.ok(avatar.includes('prefers-reduced-motion: reduce'));
    assert.ok(avatar.includes("getContext('webgl2')"));
    assert.ok(avatar.includes('animation-name'), 'the rigged Idle clip must be selected');
    assert.match(avatar, /minimumRenderScale = 1/, 'slow frames must not widen the canvas past the RTL stage');
    assert.match(avatar, /if \(!reducedMotion\(\)\) element\.setAttribute\('autoplay'/);
    assert.match(avatar, /viewer\.style\.display = 'none'/);
    assert.match(avatar, /state = 'error';\s*wanted = false;/, 'a failed model must fall back to the poster');
});

test('the 3D view is opt-in: opening the modal never downloads the viewer or the model', () => {
    const observer = avatar.slice(avatar.indexOf('new MutationObserver'), avatar.indexOf('.observe(modal'));
    assert.doesNotMatch(observer, /\bmount\(\)/, 'opening the modal must not start the download');
    assert.match(avatar, /button\.addEventListener\('click', toggle\)/);
    assert.ok(avatar.includes("TOGGLE_ID = 'assistantAvatarToggle'"));
    assert.match(avatar, /toggle\.setAttribute\('aria-pressed', String\(showing\)\)/);
    assert.match(avatar, /toggle\.disabled = busy \|\| state === 'unsupported' \|\| state === 'error'/);
});

test('the modal keeps a hidden stage with the portrait and an explicit 3D toggle', () => {
    const stage = modal.indexOf('id="assistantAvatarStage"');
    const log = modal.indexOf('id="assistantLog"');
    assert.ok(stage > -1 && stage < log, 'the stage sits between the header and the conversation');
    const markup = modal.slice(stage, log);
    assert.match(markup, /id="assistantAvatarStage"[^>]*hidden/);
    assert.match(markup, /src="icons\/assistant-abbah-full\.png"/);
    assert.match(markup, /id="assistantAvatarMount"/);
    assert.match(markup, /id="assistantAvatarToggle"[^>]*aria-pressed="false"[^>]*aria-busy="false"/);
    assert.match(markup, /class="fa-solid fa-cube"/);
    assert.match(modal, /class="assistant-avatar"><img src="icons\/assistant-abbah\.png"/);
});

test('the built shell loads the avatar module with a content hash and keeps assets out of the shell', () => {
    assert.ok(template.includes('<script src="js/assistant-avatar-3d.js"></script>'));
    assert.ok(
        template.indexOf('js/assistant-avatar-3d.js') > template.indexOf('js/assistant.js'),
        'the module must load after the assistant it decorates'
    );
    assert.match(html, /<script src="js\/assistant-avatar-3d\.js\?v=[0-9a-f]{10}"><\/script>/);
    assert.match(sw, /'\.\/js\/assistant-avatar-3d\.js\?v=[0-9a-f]{10}'/);
    assert.ok(!html.includes('model-viewer.min.js'), 'the viewer bundle is fetched lazily, not in index.html');
    const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
    assert.ok(!shell.includes('model-viewer'), 'the viewer bundle must not bloat the app shell');
    assert.ok(!shell.includes('assistant-abbah-3d-rigged'), 'the rigged model loads on demand only');
});

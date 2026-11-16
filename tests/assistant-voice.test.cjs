const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const size = file => fs.statSync(path.join(root, file)).size;

const voice = read('js/assistant-voice.js');
const modal = read('src/partials/modals.html');
const template = read('src/index.template.html');
const html = read('index.html');
const sw = read('sw.js');
const app = read('js/app.js');

test('the speech runtime, its license and the model license are committed', () => {
    assert.match(read('js/vendor/onnxruntime-web.min.js'), /onnxruntime/);
    assert.ok(size('js/vendor/ort-wasm-simd-threaded.wasm') > 10_000_000, 'the WASM backend must be the full build');
    assert.ok(size('js/vendor/ort-wasm-simd-threaded.mjs') > 10_000, 'the WASM loader must be committed');
    assert.match(read('js/vendor/onnxruntime-web-LICENSE.txt'), /MIT License/);
    assert.match(read('js/vendor/egyptian-arabic-wav2vec2-LICENSE.txt'), /Apache License/);
    assert.doesNotThrow(() => new vm.Script(voice, { filename: 'assistant-voice.js' }));
});

test('only the pinned GitHub model chunks may be fetched, and their assembled bytes are verified', () => {
    const urls = voice.match(/https?:\/\/[^'"\s]+/g) || [];
    assert.deepEqual(urls, [
        'https://raw.githubusercontent.com/manzilsystem/manzil-assistant-assets/4dbb976b416dedcd1a2f42c0be7841e8c503c66b/speech/egyptian-arabic-wav2vec2/model_int8.onnx.part-'
    ], 'the pinned GitHub repository revision is the only model endpoint');
    assert.doesNotMatch(voice, /huggingface\.co|hf\.co/);
    assert.match(voice, /ASSISTANT_ASR_REVISION = '888b8be067d3a1ac2ca72806832f29e8786a3341'/);
    assert.match(voice, /ASSISTANT_ASR_MODEL_SIZE = 317268245/);
    assert.match(voice, /ASSISTANT_ASR_MODEL_SHA256 = '2d8525c7b0e27eff0d43aa061c440b95105ce994f0c76f398e75a4d7659bbcc6'/);
    assert.match(voice, /ASSISTANT_ASR_MODEL_CHUNK_SIZE = 41943040/);
    assert.match(voice, /ASSISTANT_ASR_MODEL_CHUNK_COUNT = Math\.ceil\(ASSISTANT_ASR_MODEL_SIZE \/ ASSISTANT_ASR_MODEL_CHUNK_SIZE\)/);
    assert.match(voice, /async function assistantVoiceDownloadModel\(signal\)/);
    assert.match(voice, /const expectedSize = Math\.min\(ASSISTANT_ASR_MODEL_CHUNK_SIZE, ASSISTANT_ASR_MODEL_SIZE - totalSize\)/);
    assert.match(voice, /crypto\.subtle\.digest\('SHA-256'/);
    assert.match(voice, /digest !== ASSISTANT_ASR_MODEL_SHA256/);
});

test('the recording and transcript stay on the device', () => {
    assert.doesNotMatch(voice, /\blocalStorage\b/, 'nothing may be written to localStorage');
    assert.doesNotMatch(voice, /\bsendBeacon\b/);
    assert.doesNotMatch(voice, /supabaseClient|\.rpc\(|\.from\('/);
    assert.doesNotMatch(voice, /sendAssistantMessage\s*\(/, 'the transcript must be staged for review, never auto-sent');
    assert.match(voice, /field\.value = transcript\.slice\(0, 240\)/);
    assert.match(voice, /لم أرسل التسجيل أو النص تلقائيًا/);
    assert.match(voice, /indexedDB\.open\(ASSISTANT_ASR_DB, 1\)/);
});

test('the model and runtime load automatically on the first microphone request without a download-confirmation prompt', () => {
    assert.match(voice, /function assistantVoiceLoadRuntime\(\)/);
    assert.match(voice, /script\.src = `\$\{ASSISTANT_VOICE_ORT_SRC\}\?v=\$\{assistantVoiceRelease\(\)\}`/);
    const microphone = voice.indexOf('async function startAssistantVoiceInput()');
    const runtime = voice.indexOf('await assistantVoiceLoadModel()', microphone);
    assert.ok(microphone > -1 && runtime > microphone, 'the first microphone request starts automatic loading');
    assert.doesNotMatch(voice, /window\.confirm\('لتفعيل الإدخال الصوتي التجريبي/);
    assert.match(voice, /await assistantVoiceBeginRecording\(\)/);
    assert.match(voice, /317MB/);
    assert.ok(!template.includes('onnxruntime'), 'the runtime must not be a static script in the template');
    assert.ok(!html.includes('onnxruntime'), 'the runtime must not be requested on first paint');
    assert.ok(!html.includes('ort-wasm'), 'the WASM backend must not be requested on first paint');
    assert.match(html, /js\/assistant-voice\.js\?v=[0-9a-f]{10}/);
    assert.match(sw, /'\.\/js\/assistant-voice\.js\?v=[0-9a-f]{10}'/);
    const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
    assert.ok(!shell.includes('onnxruntime') && !shell.includes('ort-wasm'), 'the runtime must not bloat the app shell');
});

test('the first model download opens an accessible progress dialog that owners may use and cancel', () => {
    assert.match(voice, /function assistantVoiceShowDownloadDialog\(\)/);
    assert.match(voice, /function assistantVoiceUpdateDownloadProgress\(loadedBytes\)/);
    assert.match(voice, /response\.body\?\.getReader\(\)/);
    assert.match(voice, /assistantVoiceUpdateDownloadProgress\(downloadedSize \+ size\)/);
    assert.match(modal, /id="assistantVoiceDownloadModal" role="dialog" aria-modal="true"[^>]*aria-labelledby="assistantVoiceDownloadTitle"/);
    assert.match(modal, /<progress id="assistantVoiceDownloadProgress"[^>]*max="100" value="0"[^>]*aria-valuenow="0"/);
    assert.match(modal, /id="assistantVoiceDownloadPercentage"/);
    assert.match(modal, /id="assistantVoiceDownloadBytes"/);
    assert.match(app, /OWNER_ALLOWED_MODALS = new Set\(\['assistantModal', 'assistantVoiceDownloadModal'\]\)/);
    assert.match(app, /window\.cancelAssistantVoiceDownload\?\.\(\)/);
});

test('the service worker serves the runtime WASM loader as a JavaScript module', () => {
    assert.match(sw, /if \(url\.pathname\.endsWith\('\.mjs'\)\)/);
    assert.match(sw, /'Content-Type': 'text\/javascript; charset=utf-8'/);
    const mjs = sw.indexOf("endsWith('.mjs')");
    const hashed = sw.indexOf("url.searchParams.has('v')");
    assert.ok(mjs > -1 && hashed > mjs, 'the module must be normalized before the immutable-asset branch');
});

test('the first microphone click starts recording after verification, with bounded capture and track release', () => {
    assert.match(voice, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
    assert.match(voice, /ASSISTANT_ASR_MAX_RECORDING_MS = 15000/);
    assert.match(voice, /assistantVoiceStopRecording\(true\)/, 'closing the modal discards the recording');
    assert.match(voice, /track\.stop\(\)/, 'the microphone tracks must be released');
    assert.ok(!/getUserMedia/.test(voice.slice(0, voice.indexOf('async function assistantVoiceBeginRecording'))), 'no capture outside the recording path');
});

test('the cached model can be deleted and the delete control follows the cache', () => {
    assert.match(voice, /async function deleteAssistantVoiceModel\(\)/);
    assert.match(voice, /window\.confirm\('سيُحذف نموذج التعرف الصوتي/);
    assert.match(voice, /await assistantVoiceDeleteCachedModel\(\)/);
    assert.match(voice, /deleteButton\.hidden = !\(await assistantVoiceHasCachedModel\(\)\)/);
    assert.match(voice, /window\.deleteAssistantVoiceModel = deleteAssistantVoiceModel/);
    assert.match(voice, /window\.cancelAssistantVoiceDownload = cancelAssistantVoiceDownload/);
});

test('the modal exposes accessible voice controls inside the form', () => {
    const form = modal.indexOf('<form class="assistant-form"');
    const mic = modal.indexOf('id="assistantVoiceButton"');
    const input = modal.indexOf('id="assistantInput"');
    assert.ok(form > -1 && mic > form && mic < input, 'the mic sits in the input row');
    assert.match(modal, /<button type="button" id="assistantVoiceButton"[^>]*onclick="startAssistantVoiceInput\(\)"/);
    assert.match(modal, /<p id="assistantVoiceStatus"[^>]*role="status"[^>]*hidden>/);
    assert.match(modal, /<button type="button" id="assistantVoiceCancelButton"[^>]*hidden>/);
    assert.match(modal, /<button type="button" id="assistantVoiceDeleteButton"[^>]*hidden>/);
    assert.match(modal, /317MB[\s\S]*?تلقائيًا من مستودع GitHub/);
    assert.ok(!modal.includes('بدون إنترنت أو خدمات خارجية'), 'the footnote must not claim voice never uses the network');
});

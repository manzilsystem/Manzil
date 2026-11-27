const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const voiceSource = fs.readFileSync(path.join(root, 'js', 'assistant-voice.js'), 'utf8');
const assistantSource = fs.readFileSync(path.join(root, 'js', 'assistant.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

function createHarness(extra = {}) {
    const appended = [];
    const sent = [];
    const revoked = [];
    let input;
    const sandbox = {
        console,
        Date,
        Math,
        Promise,
        Map,
        URL: { createObjectURL: () => 'blob:voice', revokeObjectURL: url => revoked.push(url) },
        Blob: function Blob() { this.size = 1; },
        Audio: class AudioStub { play() { return Promise.resolve(); } pause() {} },
        SpeechSynthesisUtterance: class SpeechSynthesisUtteranceStub {
            constructor(text) { this.text = String(text); }
        },
        window: { addEventListener() {}, speechSynthesis: undefined },
        document: {
            addEventListener() {},
            getElementById: id => id === 'assistantInput' ? input : null,
            querySelector: () => null,
            createElement: () => {
                const element = {
                    innerHTML: '',
                    textContent: '',
                    querySelector(selector) {
                        if (selector !== 'p') return null;
                        const match = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(element.innerHTML);
                        return match ? { textContent: match[1].replace(/<[^>]*>/g, '') } : null;
                    },
                    setAttribute() {}
                };
                return element;
            }
        },
        navigator: {},
        sessionStorage: { getItem: () => '1', setItem() {} },
        toast() {},
        assistantIsConfirmation: text => /^(?:اكد|أكد)(?: التسجيل| الحفظ| العملية| التحصيل| المصروف)?$|^(?:ايوه|نعم|تمام)$/.test(String(text)),
        assistantIsCancellation: text => /^(?:الغي|إلغاء)/.test(String(text)),
        assistantEscape: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        appendAssistantMessage: (role, html, text) => appended.push({ role, html, text }),
        sendAssistantMessage: (event, options) => sent.push(options || {}),
        updateAssistantComposerState() {}
    };
    Object.assign(sandbox, extra);
    input = { value: '', style: {}, focus() {} };
    const context = vm.createContext(sandbox);
    vm.runInContext(voiceSource, context, { filename: 'js/assistant-voice.js' });
    const api = vm.runInContext(`({
        assistantVoiceNeedsReview,
        assistantVoicePick,
        assistantVoiceExpandAbbreviations,
        assistantVoiceResponseText,
        assistantVoiceSpeakText,
        assistantVoiceNoteHtml,
        assistantVoiceWaveHtml,
        assistantVoiceReadSoundPreference,
        assistantVoiceSubmit,
        assistantVoiceConsumeReviewNote,
        assistantVoiceClearPendingReview,
        assistantVoiceStop,
        assistantVoiceStart,
        assistantVoiceFinish,
        interim: () => assistantVoiceInterim,
        languageIndex: () => assistantVoiceLangIndex
    })`, context);
    return { api, input, appended, sent, revoked };
}

test('voice notes keep browser dictation and TTS with optional Groq refinement', () => {
    assert.match(voiceSource, /webkitSpeechRecognition/, 'Safari prefix must be supported alongside the standard API');
    assert.match(voiceSource, /ASSISTANT_VOICE_LANGS = Object\.freeze\(\['ar-EG', 'ar-SA', 'ar'\]\)/);
    assert.match(voiceSource, /recognition\.lang = ASSISTANT_VOICE_LANGS\[assistantVoiceLangIndex % ASSISTANT_VOICE_LANGS\.length\]/);
    assert.match(voiceSource, /SpeechRecognitionPhrase/, 'domain words boost Egyptian Arabic dictation');
    assert.match(voiceSource, /\['تحصيل', 8\]/, 'collection vocabulary is boosted');
    assert.match(voiceSource, /getUserMedia\(\{ audio: true \}\)/);
    assert.match(voiceSource, /new MediaRecorder\(/);
    assert.match(voiceSource, /assistantVoiceFinaliseRecorder/, 'the recording is kept in memory as a blob URL');
    assert.match(voiceSource, /URL\.createObjectURL/);
    assert.match(voiceSource, /globalThis\.assistantGroqTranscribe/, 'Groq Whisper may refine the final transcript');
    assert.match(voiceSource, /globalThis\.assistantGroqSpeak/, 'Groq audio is the primary reply voice');
    assert.match(voiceSource, /assistantVoiceBrowserSpeak/, 'browser speech is only a fallback');
    assert.match(voiceSource, /ASSISTANT_VOICE_MALE_HINTS/, 'the fallback prefers a male Arabic voice');
    assert.match(voiceSource, /utterance\.lang = ASSISTANT_VOICE_LANGS\[0\]/);
    assert.ok(voiceSource.includes("replace(/أ\\s*\\/\\s*/g, 'أستاذ ')"),
        'أ/ is expanded before speaking');
    assert.doesNotMatch(voiceSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//);
    assert.doesNotMatch(voiceSource, /localStorage/);
    assert.doesNotMatch(html, /connect-src[^>]*huggingface|connect-src[^>]*groq/i, 'no speech API origin is added to the CSP');
});

test('spoken confirmations and operation commands always require a typed review', () => {
    const { api } = createHarness();
    assert.equal(api.assistantVoiceNeedsReview('أكد التسجيل'), true);
    assert.equal(api.assistantVoiceNeedsReview('ايوه'), true);
    assert.equal(api.assistantVoiceNeedsReview('إلغاء'), true);
    assert.equal(api.assistantVoiceNeedsReview('اعمل اعلان صيانة'), true);
    assert.equal(api.assistantVoiceNeedsReview('سجل تحصيل 100'), true);
    assert.equal(api.assistantVoiceNeedsReview('مين عليه متأخرات؟'), false);
    assert.equal(api.assistantVoiceNeedsReview('رصيد الخزنة كام؟'), false);
    assert.equal(api.assistantVoiceNeedsReview('مصروفات الشهر'), false);
    assert.match(voiceSource, /راجع الكلام واضغط إرسال عشان تتأكد/, 'review puts the transcript in the composer with an explicit hint');
    assert.match(voiceSource, /sendAssistantMessage\(null, \{ userHtml: noteHtml \}\)/, 'questions are sent automatically with their voice bubble');
});

test('spoken replies are short, plain text, and never read raw HTML', () => {
    const { api } = createHarness();
    const text = api.assistantVoiceResponseText({
        title: 'رصيد الخزنة',
        html: '<p>الرصيد 1200 ج.م</p><table><tr><td>سرّ المالك</td></tr></table>'
    });
    assert.match(text, /رصيد الخزنة/);
    assert.match(text, /جنيه/);
    assert.doesNotMatch(text, /<[^>]+>/);
    assert.doesNotMatch(text, /سرّ المالك/, 'only the title and first line are read aloud');
    assert.equal(api.assistantVoiceExpandAbbreviations('أ/سمير الشافعي'), 'أستاذ سمير الشافعي');
    assert.match(voiceSource, /ASSISTANT_VOICE_MAX_SPEAK_CHARS = 420/);
    assert.match(voiceSource, /assistantVoiceStopSpeech\(\)/, 'a new reply cancels the previous speech');
});

test('voice bubbles escape the transcript and show duration and playback', () => {
    const { api } = createHarness();
    const note = api.assistantVoiceNoteHtml('سجل <تحصيل> الشقة 3', 6500, 'blob:voice');
    assert.match(note, /data-voice-note="note-1"/);
    assert.match(note, /assistantVoicePlayNote\('note-1'\)/);
    assert.match(note, /&lt;تحصيل&gt;/);
    assert.doesNotMatch(note, /<تحصيل>/);
    assert.match(note, /assistant-voice-duration" dir="ltr">0:07/);
    assert.match(note, /assistant-voice-transcript/);
    assert.equal((api.assistantVoiceWaveHtml('abc').match(/<i /g) || []).length, 16);
});

test('sound preference is session-only and capturing stops on close, reset and busy', () => {
    const { api } = createHarness();
    assert.equal(api.assistantVoiceReadSoundPreference(), true);
    assert.match(voiceSource, /ASSISTANT_VOICE_SOUND_KEY = 'manzil-assistant-voice-sound'/);
    assert.match(voiceSource, /sessionStorage\.setItem\(ASSISTANT_VOICE_SOUND_KEY/);
    assert.match(voiceSource, /assistantVoiceIsBusy\(\)/);
    assert.match(appSource, /if \(id === 'assistantModal' && typeof assistantVoiceStop === 'function'\)/);
    assert.match(assistantSource, /assistantVoiceStop\('cancel'\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.assistant-voice-button\.is-recording/);
});

test('a reviewed voice note is added once, when the user actually presses Send', () => {
    const { api, input, appended, sent } = createHarness();
    const note = '<div class="assistant-voice-note"> reviewed </div>';
    api.assistantVoiceSubmit('أكد التسجيل', note);

    assert.equal(appended.length, 0, 'review must not append a user turn before confirmation');
    assert.equal(sent.length, 0, 'review must not auto-send a financial command');
    assert.equal(input.value, 'أكد التسجيل');
    assert.equal(api.assistantVoiceConsumeReviewNote('أكد التسجيل'), note, 'unchanged text keeps its voice bubble on Send');
    assert.equal(api.assistantVoiceConsumeReviewNote('أكد التسجيل'), null, 'the note is consumed exactly once');

    api.assistantVoiceSubmit('سجل تحصيل 100', '<div>voice</div>');
    assert.equal(api.assistantVoiceConsumeReviewNote('سجل تحصيل 200'), null, 'editing the transcript falls back to a typed bubble');

    api.assistantVoiceSubmit('مين عليه متأخرات؟', '<div>question</div>');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].userHtml, '<div>question</div>');
    assert.match(assistantSource, /assistantVoiceConsumeReviewNote\(text\)/, 'the composer reuses the reviewed voice bubble');
    assert.doesNotMatch(voiceSource, /assistantVoiceNeedsReview[\s\S]{0,400}appendAssistantMessage\('user'/, 'review never pre-appends the turn');
});

test('cancelling a reviewed voice note clears the pending bubble and releases its audio', () => {
    const { api, revoked } = createHarness();
    const note = api.assistantVoiceNoteHtml('إلغاء', 3000, 'blob:voice');
    api.assistantVoiceSubmit('إلغاء', note);
    assert.ok(api.assistantVoiceConsumeReviewNote('إلغاء'));

    const second = api.assistantVoiceNoteHtml('إلغاء', 3000, 'blob:voice');
    api.assistantVoiceSubmit('إلغاء', second);
    api.assistantVoiceStop('cancel');
    assert.equal(api.assistantVoiceConsumeReviewNote('إلغاء'), null);
    assert.ok(revoked.includes('blob:voice'), 'the unreviewed recording is not kept in memory');
});

function recognitionHarness(recorder = false, transcribe = null) {
    const recognitions = [];
    const toasts = [];
    let releasePermission;
    class FakeRecognition {
        constructor() {
            recognitions.push(this);
            this.lang = '';
        }

        start() { this.started = true; }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
    }
    const windowStub = { addEventListener() {}, speechSynthesis: undefined, SpeechRecognition: FakeRecognition };
    const extra = {
        window: windowStub,
        toast: (message, type) => toasts.push({ message, type })
    };
    if (recorder) {
        const FakeRecorder = function FakeRecorder() {
            this.state = 'recording';
            this.start = () => {};
            this.stop = () => { this.state = 'inactive'; this.onstop?.(); };
        };
        FakeRecorder.isTypeSupported = () => true;
        extra.MediaRecorder = FakeRecorder;
        extra.navigator = {
            mediaDevices: {
                getUserMedia: () => new Promise(resolve => { releasePermission = resolve; })
            }
        };
    }
    if (transcribe) extra.assistantGroqTranscribe = transcribe;
    const harness = createHarness(extra);
    return { ...harness, recognitions, toasts, release: value => releasePermission?.(value) };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('dictation starts before mic recording permission and keeps words later emptied by an interim result', async () => {
    const { api, sent, recognitions, toasts, release } = recognitionHarness(true);
    await api.assistantVoiceStart();
    assert.equal(recognitions.length, 1, 'recognition is not blocked by the recording permission prompt');
    assert.equal(recognitions[0].lang, 'ar-EG');

    recognitions[0].onresult({ results: [{ isFinal: false, 0: { transcript: 'رصيد الخزنة' } }] });
    recognitions[0].onresult({ results: [{ isFinal: false, 0: { transcript: '' } }] });
    assert.equal(api.interim(), 'رصيد الخزنة', 'an empty interim result does not erase the heard words');
    recognitions[0].onresult({ results: [{ isFinal: true, 0: { transcript: 'رصيد الخزنة كام؟' } }] });
    recognitions[0].onend();
    await tick();

    assert.equal(sent.length, 1);
    assert.match(sent[0].userHtml, /رصيد الخزنة كام؟/);
    assert.equal(toasts.length, 0);
    release({ getTracks: () => [{ stop() {} }] });
    await tick();
    assert.equal(toasts.length, 0, 'a late permission grant does not produce a false error');
});

test('Groq transcription refines the final transcript and browser text stays the fallback', async () => {
    const refined = recognitionHarness(true, async () => 'رصيد الخزنة 1200 جنيه');
    await refined.api.assistantVoiceStart();
    refined.release({ getTracks: () => [{ stop() {} }] });
    await tick();
    refined.recognitions[0].onresult({ results: [{ isFinal: true, 0: { transcript: 'رصيد الخزنة' } }] });
    refined.recognitions[0].onend();
    await tick(); await tick();
    assert.equal(refined.sent.length, 1);
    assert.match(refined.sent[0].userHtml, /1200 جنيه/);

    const fallback = recognitionHarness(true, async () => '');
    await fallback.api.assistantVoiceStart();
    fallback.release({ getTracks: () => [{ stop() {} }] });
    await tick();
    fallback.recognitions[0].onresult({ results: [{ isFinal: true, 0: { transcript: 'رصيد الخزنة' } }] });
    fallback.recognitions[0].onend();
    await tick(); await tick();
    assert.equal(fallback.sent.length, 1);
    assert.match(fallback.sent[0].userHtml, /رصيد الخزنة/);
    assert.doesNotMatch(fallback.sent[0].userHtml, /1200/);
});

test('a quick press explains the hold gesture and the next press tries another Arabic dialect', async () => {
    const { api, recognitions, toasts } = recognitionHarness();
    await api.assistantVoiceStart();
    recognitions[0].onend();
    await tick();
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].message, /اضغط مطولاً/);
    assert.doesNotMatch(toasts[0].message, /ما سمعتش كلام واضح/);
    assert.equal(api.languageIndex(), 1);

    await api.assistantVoiceStart();
    assert.equal(recognitions[1].lang, 'ar-SA');
    recognitions[1].onerror({ error: 'no-speech' });
    recognitions[1].onend();
    await tick();
    assert.match(toasts[1].message, /قرّب من المايك/);
    assert.equal(api.languageIndex(), 2);
});

test('the doorman voice prefers a male Arabic voice and falls back honestly', () => {
    const { api } = createHarness();
    const v = (name, lang) => ({ name, lang, voiceURI: name });
    const picked = api.assistantVoicePick([v('Laila', 'ar-EG'), v('Majed', 'ar-SA'), v('Samantha', 'en-US')]);
    assert.equal(picked.voice.name, 'Majed');
    assert.equal(picked.male, true);
    const egyptianMale = api.assistantVoicePick([v('Majed', 'ar-SA'), v('Google Egypt male', 'ar-EG')]);
    assert.equal(egyptianMale.voice.name, 'Google Egypt male');
    const femaleOnly = api.assistantVoicePick([v('Laila', 'ar-EG'), v('Samantha', 'en-US')]);
    assert.equal(femaleOnly.voice.name, 'Laila');
    assert.equal(femaleOnly.male, false, 'pitch is lowered when no male voice exists');
    const none = api.assistantVoicePick([v('Samantha', 'en-US')]);
    assert.equal(none.voice, null);
    assert.equal(none.male, false);
    assert.match(voiceSource, /utterance\.pitch = 0\.8/);
});

test('Groq audio is the primary reply voice and browser speech is fallback only', async () => {
    const groqCalls = [];
    const played = [];
    const spoken = [];
    class FakeAudio {
        constructor(url) { this.url = url; played.push(this); }
        play() { return Promise.resolve(); }
        pause() { this.paused = true; }
    }
    const primary = createHarness({
        assistantGroqSpeak: async text => { groqCalls.push(text); return { size: 256 }; },
        Audio: FakeAudio,
        window: {
            addEventListener() {},
            speechSynthesis: {
                getVoices: () => [{ lang: 'ar-EG', name: 'Kareem Male' }],
                speak: utterance => spoken.push(utterance),
                cancel() {}
            }
        }
    });
    await primary.api.assistantVoiceSpeakText('أ/سمير الشافعي: الخزنة 100 جنيه');
    assert.deepEqual(groqCalls, ['أستاذ سمير الشافعي: الخزنة 100 جنيه']);
    assert.equal(played.length, 1, 'the Groq WAV is played through an in-memory blob URL');
    assert.equal(spoken.length, 0, 'the browser voice is not used when Groq answers');

    const fallbackSpoken = [];
    const fallback = createHarness({
        assistantGroqSpeak: async () => null,
        Audio: FakeAudio,
        window: {
            addEventListener() {},
            speechSynthesis: {
                getVoices: () => [
                    { lang: 'ar-EG', name: 'Arabic Female' },
                    { lang: 'ar-SA', name: 'Sultan Male' }
                ],
                speak: utterance => {
                    fallbackSpoken.push(utterance);
                    utterance.onend?.();
                },
                cancel() {}
            }
        }
    });
    await fallback.api.assistantVoiceSpeakText('رصيد الخزنة كام؟');
    assert.equal(fallbackSpoken.length, 1, 'browser TTS runs only after Groq fails');
    assert.equal(fallbackSpoken[0].text, 'رصيد الخزنة كام؟');
    assert.equal(fallbackSpoken[0].lang, 'ar-SA', 'the male Arabic voice wins even when it is not Egyptian');
    assert.equal(fallbackSpoken[0].voice.name, 'Sultan Male', 'the fallback prefers a male Arabic voice');
});

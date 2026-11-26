// @ts-check
// عم عبده — voice notes in the style of a WhatsApp chat.
// Browser dictation gives instant feedback and stays the fallback. When the
// Groq bridge is available, the finished recording is optionally transcribed
// server-side for better Egyptian Arabic; audio is never written to storage.
// Reading aloud uses the browser's own ar-EG voice. Operation confirmations
// are never executed from speech alone — they land in the composer for review.

const ASSISTANT_VOICE_LANGS = Object.freeze(['ar-EG', 'ar-SA', 'ar']);
const ASSISTANT_VOICE_PHRASES = Object.freeze([
    ['تحصيل', 8], ['مصروف', 8], ['متأخرات', 8], ['خزنة', 8], ['إيصال', 7],
    ['شقة', 7], ['مستأجر', 7], ['اشتراك', 7], ['إعلان', 6], ['أكد التسجيل', 9],
    ['ميعاد الدفع', 6], ['صندوق التطوير', 6], ['الشهر الحالي', 5]
]);
const ASSISTANT_VOICE_SOUND_KEY = 'manzil-assistant-voice-sound';
const ASSISTANT_VOICE_MAX_SPEAK_CHARS = 420;
const ASSISTANT_VOICE_REVIEW = /(?:انشر|اعمل|جهز|سجّل|سجل|ضيف|أضف|عدّل|تعديل|احذف|امسح|إعلان|اعلان|(?:تحققت|راجعت)\s+(?:من\s+)?(?:السجل|التدقيق|العملية))/;
const ASSISTANT_VOICE_WAVE_BARS = 16;

let assistantVoiceRecognition = null;
let assistantVoiceRecorder = null;
let assistantVoiceStream = null;
let assistantVoiceChunks = [];
let assistantVoiceListening = false;
let assistantVoiceCancelled = false;
let assistantVoiceInterim = '';
let assistantVoiceLangIndex = 0;
let assistantVoiceStartedAt = 0;
let assistantVoicePointerStartY = null;
let assistantVoiceLiveElement = null;
let assistantVoiceListenersBound = false;
let assistantVoiceSoundEnabled = true;
let assistantVoicePendingSpeak = false;
let assistantVoiceLastReply = '';
let assistantVoiceActiveAudio = null;
let assistantVoiceNoteSeq = 0;
const assistantVoiceNotes = new Map();
let assistantVoicePendingReviewNote = null;

function assistantVoiceElement(id) {
    return document.getElementById(id);
}

function assistantVoiceEscape(text) {
    if (typeof assistantEscape === 'function') return assistantEscape(text);
    return String(text).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char] || char));
}

function assistantVoiceDiscardPendingNote(pending) {
    if (!pending) return;
    const id = /data-voice-note="(note-\d+)"/.exec(String(pending.html || ''))?.[1];
    if (id && assistantVoiceNotes.has(id)) {
        const note = assistantVoiceNotes.get(id);
        if (note?.url) URL.revokeObjectURL(note.url);
        assistantVoiceNotes.delete(id);
    }
}

function assistantVoiceClearPendingReview() {
    assistantVoiceDiscardPendingNote(assistantVoicePendingReviewNote);
    assistantVoicePendingReviewNote = null;
}

function assistantVoiceConsumeReviewNote(text) {
    const pending = assistantVoicePendingReviewNote;
    assistantVoicePendingReviewNote = null;
    if (!pending || pending.text !== String(text || '').trim()) {
        assistantVoiceDiscardPendingNote(pending);
        return null;
    }
    return pending.html;
}

function assistantVoiceRecogniser() {
    const scope = /** @type {any} */ (window);
    return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

function assistantVoiceIsBusy() {
    return assistantVoiceElement('assistantModal')?.dataset.assistantBusy === 'true';
}

function assistantVoiceNotify(message, type = 'success') {
    if (typeof toast === 'function') toast(message, type);
}

function assistantVoiceReadSoundPreference() {
    try {
        return sessionStorage.getItem(ASSISTANT_VOICE_SOUND_KEY) !== '0';
    } catch (error) {
        return true;
    }
}

function assistantVoiceSyncSoundButton() {
    const button = assistantVoiceElement('assistantSoundButton');
    if (!button) return;
    button.classList.toggle('is-off', !assistantVoiceSoundEnabled);
    button.setAttribute('aria-pressed', String(assistantVoiceSoundEnabled));
    button.setAttribute('aria-label', assistantVoiceSoundEnabled
        ? 'قراءة ردود عم عبده بصوت — مفعّلة'
        : 'قراءة ردود عم عبده بصوت — مقفولة');
    const icon = button.querySelector('i');
    if (icon) icon.className = assistantVoiceSoundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
}

function assistantVoiceSyncRecordButton(isRecording) {
    const button = assistantVoiceElement('assistantVoiceButton');
    if (!button) return;
    button.classList.toggle('is-recording', isRecording);
    button.setAttribute('aria-label', isRecording ? 'اسحب للإلغاء أو ارفع للإرسال' : 'اضغط مطولاً وكلّم عم عبده');
    button.setAttribute('aria-pressed', String(isRecording));
}

function assistantVoiceShowLive(text) {
    const log = assistantVoiceElement('assistantLog');
    if (!log) return;
    if (!assistantVoiceLiveElement) {
        const element = document.createElement('div');
        element.className = 'assistant-msg is-user assistant-voice-live';
        element.setAttribute('aria-hidden', 'true');
        element.innerHTML = '<div class="assistant-bubble"><span class="assistant-voice-live-dot" aria-hidden="true"></span><span class="assistant-voice-live-text">بتكلّم…</span></div>';
        log.appendChild(element);
        assistantVoiceLiveElement = element;
    }
    const label = assistantVoiceLiveElement.querySelector('.assistant-voice-live-text');
    if (label) label.textContent = text ? String(text) : 'بتكلّم…';
    log.scrollTop = log.scrollHeight;
}

function assistantVoiceHideLive() {
    if (assistantVoiceLiveElement?.parentNode) {
        assistantVoiceLiveElement.parentNode.removeChild(assistantVoiceLiveElement);
    }
    assistantVoiceLiveElement = null;
}

async function assistantVoiceCaptureStream() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') return;
    if (typeof MediaRecorder === 'undefined') return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!assistantVoiceListening) {
            // Released while the permission prompt was open; do not keep the device.
            stream.getTracks?.().forEach(track => track.stop());
            return;
        }
        assistantVoiceStream = stream;
        const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
        const mimeType = candidates.find(type => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)) || '';
        assistantVoiceRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        assistantVoiceChunks = [];
        assistantVoiceRecorder.ondataavailable = event => {
            if (event.data && event.data.size) assistantVoiceChunks.push(event.data);
        };
        assistantVoiceRecorder.start();
    } catch (error) {
        // A blocked or busy microphone must not stop free-text dictation.
        assistantVoiceRecorder = null;
        assistantVoiceStream = null;
    }
}

function assistantVoiceReleaseStream() {
    try {
        assistantVoiceStream?.getTracks().forEach(track => track.stop());
    } catch (error) {
        // The browser may already have released the device.
    }
    assistantVoiceStream = null;
}

function assistantVoiceFinaliseRecorder() {
    const recorder = assistantVoiceRecorder;
    assistantVoiceRecorder = null;
    if (!recorder || recorder.state === 'inactive') {
        assistantVoiceReleaseStream();
        return Promise.resolve(null);
    }
    return new Promise(resolve => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            assistantVoiceReleaseStream();
            try {
                const blob = new Blob(assistantVoiceChunks, { type: recorder.mimeType || 'audio/webm' });
                resolve(blob.size ? { url: URL.createObjectURL(blob), blob } : null);
            } catch (error) {
                resolve(null);
            }
        };
        recorder.onstop = done;
        try { recorder.stop(); } catch (error) { done(); }
    });
}

function assistantVoiceWaveHtml(text) {
    const seed = String(text || '').length + 3;
    let bars = '';
    for (let index = 0; index < ASSISTANT_VOICE_WAVE_BARS; index += 1) {
        const height = 5 + ((seed * (index + 3) * 7) % 19);
        bars += `<i style="height:${height}px"></i>`;
    }
    return bars;
}

function assistantVoiceNoteHtml(text, durationMs, url) {
    assistantVoiceNoteSeq += 1;
    const id = `note-${assistantVoiceNoteSeq}`;
    assistantVoiceNotes.set(id, { url, durationMs, transcript: text });
    const seconds = Math.max(1, Math.round(durationMs / 1000));
    const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return `<div class="assistant-voice-note" data-voice-note="${id}">`
        + `<button type="button" class="assistant-voice-play" onclick="assistantVoicePlayNote('${id}')" aria-label="تشغيل الرسالة الصوتية"><i class="fa-solid fa-play" aria-hidden="true"></i></button>`
        + `<span class="assistant-voice-wave" aria-hidden="true">${assistantVoiceWaveHtml(text)}</span>`
        + `<span class="assistant-voice-duration" dir="ltr">${clock}</span>`
        + `</div><p class="assistant-voice-transcript">${assistantVoiceEscape(text)}</p>`;
}

function assistantVoiceStopSpeech() {
    try {
        window.speechSynthesis?.cancel();
    } catch (error) {
        // Some browsers throw when there is no utterance in progress.
    }
}

function assistantVoiceSpeakText(text, onEnd) {
    const speech = String(text || '').trim();
    if (!speech || typeof SpeechSynthesisUtterance === 'undefined' || !window.speechSynthesis) {
        if (typeof onEnd === 'function') onEnd();
        return;
    }
    assistantVoiceStopSpeech();
    const utterance = new SpeechSynthesisUtterance(speech);
    utterance.lang = ASSISTANT_VOICE_LANGS[0];
    try {
        const voices = window.speechSynthesis.getVoices() || [];
        const arabic = voices.find(voice => /^ar[-_]/i.test(voice.lang)) || voices.find(voice => /ar/i.test(voice.lang));
        if (arabic) utterance.voice = arabic;
    } catch (error) {
        // Voice lists are optional; the default voice still reads Arabic text.
    }
    utterance.rate = 0.96;
    utterance.onend = () => { if (typeof onEnd === 'function') onEnd(); };
    utterance.onerror = () => { if (typeof onEnd === 'function') onEnd(); };
    window.speechSynthesis.speak(utterance);
}

function assistantVoicePlayNote(id) {
    const note = assistantVoiceNotes.get(String(id));
    if (!note) return;
    assistantVoiceStopSpeech();
    if (assistantVoiceActiveAudio) {
        assistantVoiceActiveAudio.pause();
        assistantVoiceActiveAudio = null;
    }
    const bubble = document.querySelector(`[data-voice-note="${String(id)}"]`);
    const icon = bubble?.querySelector('.assistant-voice-play i');
    const setPlaying = playing => {
        bubble?.classList.toggle('is-playing', playing);
        if (icon) icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    };
    if (!note.url) {
        setPlaying(true);
        assistantVoiceSpeakText(note.transcript, () => setPlaying(false));
        return;
    }
    const audio = new Audio(note.url);
    assistantVoiceActiveAudio = audio;
    audio.onended = () => {
        if (assistantVoiceActiveAudio === audio) assistantVoiceActiveAudio = null;
        setPlaying(false);
    };
    audio.onerror = () => {
        if (assistantVoiceActiveAudio === audio) assistantVoiceActiveAudio = null;
        setPlaying(false);
        assistantVoiceSpeakText(note.transcript);
    };
    setPlaying(true);
    const playing = audio.play();
    if (playing && typeof playing.catch === 'function') {
        playing.catch(() => {
            if (assistantVoiceActiveAudio === audio) assistantVoiceActiveAudio = null;
            setPlaying(false);
            assistantVoiceSpeakText(note.transcript);
        });
    }
}

function assistantVoiceResponseText(answer) {
    if (!answer) return '';
    const title = String(answer.title || '').trim();
    let first = '';
    try {
        const holder = document.createElement('div');
        holder.innerHTML = String(answer.html || '');
        const paragraph = holder.querySelector('p');
        first = String((paragraph && paragraph.textContent) || holder.textContent || '').trim();
    } catch (error) {
        first = String(answer.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return [title, first].filter(Boolean).join('. ')
        .replace(/ج\.\s?م/g, 'جنيه')
        .replace(/\s+/g, ' ')
        .slice(0, ASSISTANT_VOICE_MAX_SPEAK_CHARS);
}

function assistantVoiceSpeakLast() {
    if (assistantVoiceLastReply) assistantVoiceSpeakText(assistantVoiceLastReply);
}

function assistantVoiceOnBotReply(answer, element) {
    const text = assistantVoiceResponseText(answer);
    if (text) assistantVoiceLastReply = text;
    const bubble = element?.querySelector('.assistant-bubble');
    if (bubble && !bubble.querySelector('.assistant-voice-replay')) {
        const replay = document.createElement('button');
        replay.type = 'button';
        replay.className = 'assistant-voice-replay';
        replay.setAttribute('onclick', 'assistantVoiceSpeakLast()');
        replay.setAttribute('aria-label', 'اسمع رد عم عبده');
        replay.innerHTML = '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
        const meta = bubble.querySelector('.assistant-message-meta');
        if (meta) bubble.insertBefore(replay, meta);
        else bubble.appendChild(replay);
    }
    if (assistantVoicePendingSpeak && assistantVoiceSoundEnabled && text) {
        assistantVoiceSpeakText(text);
    }
    assistantVoicePendingSpeak = false;
}

function assistantVoiceToggleSound() {
    assistantVoiceSoundEnabled = !assistantVoiceSoundEnabled;
    try {
        sessionStorage.setItem(ASSISTANT_VOICE_SOUND_KEY, assistantVoiceSoundEnabled ? '1' : '0');
    } catch (error) {
        // The toggle still works for the current session.
    }
    assistantVoiceSyncSoundButton();
    if (!assistantVoiceSoundEnabled) assistantVoiceStopSpeech();
    assistantVoiceNotify(assistantVoiceSoundEnabled ? 'قراءة الردود بصوت شغالة' : 'قراءة الردود بصوت مقفولة', 'success');
}

function assistantVoiceNeedsReview(text) {
    const confirmation = typeof assistantIsConfirmation === 'function' && assistantIsConfirmation(text);
    const cancellation = typeof assistantIsCancellation === 'function' && assistantIsCancellation(text);
    return Boolean(confirmation || cancellation || ASSISTANT_VOICE_REVIEW.test(text));
}

function assistantVoiceSubmit(text, noteHtml) {
    const input = /** @type {HTMLTextAreaElement | null} */ (assistantVoiceElement('assistantInput'));
    if (!input) return;
    if (assistantVoiceNeedsReview(text)) {
        // Put the transcript in the composer only. The bubble is added once,
        // by the Send action, after the user has actually reviewed the text.
        assistantVoicePendingReviewNote = { text, html: noteHtml };
        input.value = text;
        if (typeof updateAssistantComposerState === 'function') updateAssistantComposerState();
        assistantVoiceNotify('راجع الكلام واضغط إرسال عشان تتأكد', 'error');
        input.focus?.();
        return;
    }
    assistantVoiceClearPendingReview();
    input.value = text;
    assistantVoicePendingSpeak = true;
    if (typeof sendAssistantMessage === 'function') sendAssistantMessage(null, { userHtml: noteHtml });
}

async function assistantVoiceFinish(cancelled) {
    if (!assistantVoiceListening) return;
    assistantVoiceListening = false;
    assistantVoiceSyncRecordButton(false);
    assistantVoiceHideLive();
    assistantVoicePointerStartY = null;
    const durationMs = Math.max(300, Date.now() - assistantVoiceStartedAt);
    const recording = await assistantVoiceFinaliseRecorder();
    const url = recording?.url || null;
    let text = String(assistantVoiceInterim || '').trim();
    // Groq Whisper refines the final transcript; the browser result is kept as
    // the fallback when the bridge is absent, disabled or temporarily fails.
    if (!cancelled && recording?.blob && typeof globalThis.assistantGroqTranscribe === 'function') {
        try {
            const refined = String(await globalThis.assistantGroqTranscribe(recording.blob) || '').trim();
            if (refined) text = refined;
        } catch (error) {
            // Keep the text already heard by the browser.
        }
    }
    if (cancelled || !text) {
        assistantVoiceClearPendingReview();
        if (url) URL.revokeObjectURL(url);
        if (!cancelled) {
            // Give the next press a different dialect, since ar-EG is not
            // equally accurate for every speaker or browser installation.
            assistantVoiceLangIndex = (assistantVoiceLangIndex + 1) % ASSISTANT_VOICE_LANGS.length;
            assistantVoiceNotify(durationMs < 900
                ? 'اضغط مطولاً على المايك وكلّم عم عبده'
                : 'ما سمعتش كلام واضح، جرّب مرة تانية', 'error');
        }
        return;
    }
    assistantVoiceSubmit(text, assistantVoiceNoteHtml(text, durationMs, url));
}

async function assistantVoiceStart() {
    if (assistantVoiceListening) return;
    const Recogniser = assistantVoiceRecogniser();
    if (!Recogniser) {
        assistantVoiceNotify('المتصفح مش بيدعم الميكروفون؛ جرّب كروم أو إيدج', 'error');
        return;
    }
    if (assistantVoiceIsBusy()) {
        assistantVoiceNotify('استنّي عم عبده يخلص الرد الأول', 'error');
        return;
    }
    assistantVoiceStopSpeech();
    assistantVoiceCancelled = false;
    assistantVoiceInterim = '';
    assistantVoiceListening = true;
    assistantVoiceStartedAt = Date.now();
    assistantVoiceSyncRecordButton(true);
    assistantVoiceShowLive('');
    // Start dictation immediately. Recording the audio bubble runs in parallel,
    // because its permission prompt must not swallow the first words.
    void assistantVoiceCaptureStream();
    try {
        const recognition = new Recogniser();
        recognition.lang = ASSISTANT_VOICE_LANGS[assistantVoiceLangIndex % ASSISTANT_VOICE_LANGS.length];
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        const phraseConstructor = /** @type {any} */ (window).SpeechRecognitionPhrase;
        if (typeof phraseConstructor === 'function') {
            try {
                recognition.phrases = ASSISTANT_VOICE_PHRASES.map(entry => new phraseConstructor(entry[0], entry[1]));
            } catch (error) {
                // Contextual boosting is optional; dictation still works without it.
            }
        }
        recognition.onresult = event => {
            let finalText = '';
            let interimText = '';
            for (let index = 0; index < event.results.length; index += 1) {
                const result = event.results[index];
                const transcript = result[0]?.transcript || '';
                if (result.isFinal) finalText += transcript;
                else interimText += transcript;
            }
            const shown = (finalText || interimText).trim();
            // An empty interim result must never erase words already heard.
            if (shown) assistantVoiceInterim = shown;
            assistantVoiceShowLive(assistantVoiceInterim);
        };
        recognition.onerror = event => {
            assistantVoiceCancelled = true;
            if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
                assistantVoiceNotify('المايك مقفول؛ اسمح بالمايك من المتصفح', 'error');
            } else if (event?.error === 'network') {
                assistantVoiceNotify('التعريف الصوتي محتاج إنترنت في المتصفح ده', 'error');
            } else if (event?.error === 'no-speech') {
                assistantVoiceLangIndex = (assistantVoiceLangIndex + 1) % ASSISTANT_VOICE_LANGS.length;
                assistantVoiceNotify('المايك ما سمعش كلام، قرّب من المايك واضغط مطولاً', 'error');
            } else if (event?.error === 'audio-capture') {
                assistantVoiceNotify('المايك مشغول في برنامج تاني، قفله وجرّب', 'error');
            }
        };
        recognition.onend = () => { void assistantVoiceFinish(assistantVoiceCancelled); };
        assistantVoiceRecognition = recognition;
        recognition.start();
    } catch (error) {
        assistantVoiceRecognition = null;
        void assistantVoiceFinish(true);
        assistantVoiceNotify('الميكروفون مفتحش، جرّب تاني', 'error');
    }
}

function assistantVoiceStop(reason) {
    if (reason === 'cancel') assistantVoiceClearPendingReview();
    if (!assistantVoiceListening) return;
    if (reason === 'cancel') assistantVoiceCancelled = true;
    const recognition = assistantVoiceRecognition;
    assistantVoiceRecognition = null;
    if (!recognition) {
        void assistantVoiceFinish(assistantVoiceCancelled);
        return;
    }
    try {
        if (reason === 'cancel') recognition.abort();
        else recognition.stop();
    } catch (error) {
        void assistantVoiceFinish(assistantVoiceCancelled);
    }
}

function assistantVoiceBind() {
    if (assistantVoiceListenersBound) return;
    assistantVoiceListenersBound = true;
    assistantVoiceSoundEnabled = assistantVoiceReadSoundPreference();
    assistantVoiceSyncSoundButton();
    const button = assistantVoiceElement('assistantVoiceButton');
    if (!button) return;
    button.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        assistantVoicePointerStartY = event.clientY;
        void assistantVoiceStart();
    });
    button.addEventListener('pointermove', event => {
        if (!assistantVoiceListening || assistantVoicePointerStartY === null) return;
        if (Math.abs(event.clientY - assistantVoicePointerStartY) > 70) assistantVoiceStop('cancel');
    });
    button.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (assistantVoiceListening) assistantVoiceStop();
        else void assistantVoiceStart();
    });
    button.addEventListener('keyup', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (assistantVoiceListening) assistantVoiceStop();
    });
    window.addEventListener('pointerup', () => {
        if (assistantVoiceListening) assistantVoiceStop();
    });
    window.addEventListener('pointercancel', () => {
        if (assistantVoiceListening) assistantVoiceStop('cancel');
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && assistantVoiceListening) assistantVoiceStop('cancel');
    });
}

document.addEventListener('DOMContentLoaded', assistantVoiceBind);

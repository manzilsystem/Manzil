const ASSISTANT_ASR_MODEL_URL = 'https://huggingface.co/agharib/egyptian-arabic-wav2vec2-xlsr-53-onnx/resolve/888b8be067d3a1ac2ca72806832f29e8786a3341/onnx/model_int8.onnx';
const ASSISTANT_ASR_REVISION = '888b8be067d3a1ac2ca72806832f29e8786a3341';
const ASSISTANT_ASR_MODEL_SIZE = 317268245;
const ASSISTANT_ASR_MODEL_SHA256 = '2d8525c7b0e27eff0d43aa061c440b95105ce994f0c76f398e75a4d7659bbcc6';
const ASSISTANT_VOICE_ORT_SRC = 'js/vendor/onnxruntime-web.min.js';
const ASSISTANT_ASR_DB = 'assistant-speech-models';
const ASSISTANT_ASR_STORE = 'models';
const ASSISTANT_ASR_MODEL_KEY = 'egyptian-arabic-wav2vec2';
const ASSISTANT_ASR_RATE = 16000;
const ASSISTANT_ASR_BLANK = 40;
const ASSISTANT_ASR_TOKENS = [
    '|', 'ء', 'آ', 'أ', 'إ', 'ئ', 'ا', 'ب', 'ة', 'ت', 'ث', 'ج', 'ح', 'خ', 'د',
    'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل',
    'م', 'ن', 'ه', 'و', 'ى', 'ي', 'ڨ', 'ی', 'ﻻ', '[UNK]', '[PAD]'
];
const ASSISTANT_ASR_MAX_RECORDING_MS = 15000;

let assistantAsrSession = null;
let assistantAsrSessionPromise = null;
let assistantVoiceRecorder = null;
let assistantVoiceStream = null;
let assistantVoiceChunks = [];
let assistantVoiceStopTimer = 0;
let assistantVoiceBusy = false;
let assistantVoiceDiscardRecording = false;
let assistantVoiceDownloadController = null;
let assistantVoiceRuntimePromise = null;

function assistantVoiceRelease() {
    return (typeof window.MANZIL_RELEASE === 'string' && window.MANZIL_RELEASE) || 'dev';
}

function assistantVoiceLoadRuntime() {
    if (window.ort) return Promise.resolve(window.ort);
    if (assistantVoiceRuntimePromise) return assistantVoiceRuntimePromise;
    assistantVoiceRuntimePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${ASSISTANT_VOICE_ORT_SRC}?v=${assistantVoiceRelease()}`;
        script.async = true;
        script.addEventListener('load', () => {
            if (window.ort) resolve(window.ort);
            else reject(new Error('The local ONNX runtime did not initialize'));
        }, { once: true });
        script.addEventListener('error', () => reject(new Error('The local ONNX runtime could not load')), { once: true });
        document.head.appendChild(script);
    }).catch(error => {
        assistantVoiceRuntimePromise = null;
        throw error;
    });
    return assistantVoiceRuntimePromise;
}

async function assistantVoiceModelDigest(bytes) {
    if (!window.crypto || !window.crypto.subtle) throw new Error('SHA-256 verification is unavailable');
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function assistantVoiceMaybeReleaseSession() {
    const modal = document.getElementById('assistantModal');
    if (assistantVoiceBusy || !modal || !modal.classList.contains('hidden') || !assistantAsrSession) return;
    const session = assistantAsrSession;
    assistantAsrSession = null;
    assistantAsrSessionPromise = null;
    session.release().catch(error => console.error('Assistant speech model cleanup failed:', error));
}

function assistantVoiceStatus(message) {
    const status = document.getElementById('assistantVoiceStatus');
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
}

function assistantVoiceButton(recording, busy = false) {
    const button = document.getElementById('assistantVoiceButton');
    if (!button) return;
    const icon = button.querySelector('i');
    button.disabled = busy;
    button.classList.toggle('is-recording', recording);
    button.setAttribute('aria-busy', String(busy));
    button.setAttribute('aria-pressed', String(recording));
    button.setAttribute('aria-label', recording ? 'إيقاف التسجيل الصوتي' : 'تسجيل سؤال صوتي');
    button.title = recording ? 'إيقاف التسجيل الصوتي' : 'تسجيل سؤال صوتي';
    if (icon) icon.className = `fa-solid ${recording ? 'fa-stop' : 'fa-microphone'}`;
}

function assistantVoiceOpenModelDatabase() {
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(ASSISTANT_ASR_DB, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(ASSISTANT_ASR_STORE)) {
                database.createObjectStore(ASSISTANT_ASR_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open the speech model database'));
        request.onblocked = () => reject(new Error('The speech model database is blocked'));
    });
}

async function assistantVoiceReadCachedModel() {
    const database = await assistantVoiceOpenModelDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(ASSISTANT_ASR_STORE, 'readonly');
        const request = transaction.objectStore(ASSISTANT_ASR_STORE).get(ASSISTANT_ASR_MODEL_KEY);
        let record = null;
        request.onsuccess = () => { record = request.result || null; };
        transaction.oncomplete = () => {
            database.close();
            resolve(record);
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error || new Error('Could not read the speech model'));
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error || new Error('Could not read the speech model'));
        };
    });
}

async function assistantVoiceWriteCachedModel(blob) {
    const database = await assistantVoiceOpenModelDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(ASSISTANT_ASR_STORE, 'readwrite');
        transaction.objectStore(ASSISTANT_ASR_STORE).put({
            revision: ASSISTANT_ASR_REVISION,
            blob
        }, ASSISTANT_ASR_MODEL_KEY);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error || new Error('Could not save the speech model'));
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error || new Error('Could not save the speech model'));
        };
    });
}

async function assistantVoiceDeleteCachedModel() {
    const database = await assistantVoiceOpenModelDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(ASSISTANT_ASR_STORE, 'readwrite');
        transaction.objectStore(ASSISTANT_ASR_STORE).delete(ASSISTANT_ASR_MODEL_KEY);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error || new Error('Could not delete the speech model'));
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error || new Error('Could not delete the speech model'));
        };
    });
}

async function assistantVoiceGetCachedModel() {
    const record = await assistantVoiceReadCachedModel();
    if (!record) return null;
    if (record.revision !== ASSISTANT_ASR_REVISION || !(record.blob instanceof Blob) || record.blob.size !== ASSISTANT_ASR_MODEL_SIZE) {
        console.warn('Removing an outdated or incomplete assistant speech model.');
        await assistantVoiceDeleteCachedModel();
        return null;
    }
    return record.blob;
}

async function assistantVoiceHasCachedModel() {
    return Boolean(await assistantVoiceGetCachedModel());
}

async function assistantVoiceSyncModelControls() {
    const deleteButton = document.getElementById('assistantVoiceDeleteButton');
    if (!deleteButton) return;
    try {
        deleteButton.hidden = !(await assistantVoiceHasCachedModel());
    } catch (error) {
        console.error('Assistant speech model cache check failed:', error);
    }
}

async function assistantVoiceLoadModel() {
    if (assistantAsrSession) return assistantAsrSession;
    if (assistantAsrSessionPromise) return assistantAsrSessionPromise;

    assistantAsrSessionPromise = (async () => {
        const ort = await assistantVoiceLoadRuntime();
        let modelBlob = await assistantVoiceGetCachedModel();
        let modelBytes = null;
        if (!modelBlob) {
            assistantVoiceStatus('جارٍ تنزيل النموذج المصري المفتوح (317MB). لن يبدأ الميكروفون أثناء التنزيل.');
            assistantVoiceDownloadController = new AbortController();
            const cancelButton = document.getElementById('assistantVoiceCancelButton');
            if (cancelButton) cancelButton.hidden = false;
            try {
                const response = await fetch(ASSISTANT_ASR_MODEL_URL, {
                    mode: 'cors',
                    signal: assistantVoiceDownloadController.signal
                });
                if (!response.ok) throw new Error(`Model download failed (${response.status})`);
                modelBlob = await response.blob();
                if (modelBlob.size !== ASSISTANT_ASR_MODEL_SIZE) throw new Error('The downloaded speech model has an unexpected size');
                assistantVoiceStatus('جارٍ التحقق من سلامة النموذج…');
                modelBytes = await modelBlob.arrayBuffer();
                const digest = await assistantVoiceModelDigest(modelBytes);
                if (digest !== ASSISTANT_ASR_MODEL_SHA256) throw new Error('The downloaded speech model failed integrity verification');
            } finally {
                assistantVoiceDownloadController = null;
                if (cancelButton) cancelButton.hidden = true;
            }
            assistantVoiceStatus('جارٍ حفظ النموذج على جهازك…');
            await assistantVoiceWriteCachedModel(modelBlob);
            await assistantVoiceSyncModelControls();
        }

        ort.env.wasm.wasmPaths = new URL('js/vendor/', document.baseURI).href;
        ort.env.wasm.numThreads = 1;
        if (!modelBytes) modelBytes = await modelBlob.arrayBuffer();
        assistantAsrSession = await ort.InferenceSession.create(modelBytes, {
            executionProviders: ['wasm']
        });
        modelBytes = null;
        await assistantVoiceSyncModelControls();
        return assistantAsrSession;
    })();

    try {
        return await assistantAsrSessionPromise;
    } catch (error) {
        assistantAsrSessionPromise = null;
        throw error;
    }
}

function assistantVoiceSpeechBounds(samples) {
    const frameLength = 320;
    const frameCount = Math.ceil(samples.length / frameLength);
    const frameLevels = new Float32Array(frameCount);
    let maximumLevel = 0;

    for (let frame = 0; frame < frameCount; frame++) {
        const start = frame * frameLength;
        const end = Math.min(start + frameLength, samples.length);
        let energy = 0;
        for (let index = start; index < end; index++) energy += samples[index] * samples[index];
        const level = Math.sqrt(energy / Math.max(1, end - start));
        frameLevels[frame] = level;
        maximumLevel = Math.max(maximumLevel, level);
    }

    if (maximumLevel < 0.003) return null;
    const threshold = Math.max(0.0025, maximumLevel * 0.12);
    let firstFrame = frameLevels.findIndex(level => level >= threshold);
    let lastFrame = frameLevels.length - 1;
    while (lastFrame >= 0 && frameLevels[lastFrame] < threshold) lastFrame--;
    if (firstFrame < 0 || lastFrame < firstFrame) return null;

    return {
        start: Math.max(0, firstFrame * frameLength - ASSISTANT_ASR_RATE / 4),
        end: Math.min(samples.length, (lastFrame + 1) * frameLength + ASSISTANT_ASR_RATE / 4)
    };
}

async function assistantVoicePrepareAudio(blob) {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    const OfflineAudioContextType = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioContextType || !OfflineAudioContextType) throw new Error('Audio decoding is not supported');

    const context = new AudioContextType();
    let decoded;
    try {
        decoded = await context.decodeAudioData(await blob.arrayBuffer());
    } finally {
        await context.close();
    }

    if (!decoded.length || decoded.duration > ASSISTANT_ASR_MAX_RECORDING_MS / 1000 + 1) {
        throw new Error('Recording duration is invalid');
    }

    const targetLength = Math.ceil(decoded.duration * ASSISTANT_ASR_RATE);
    const offlineContext = new OfflineAudioContextType(1, targetLength, ASSISTANT_ASR_RATE);
    const source = offlineContext.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineContext.destination);
    source.start();
    const resampled = await offlineContext.startRendering();
    const samples = resampled.getChannelData(0);
    const bounds = assistantVoiceSpeechBounds(samples);
    if (!bounds || bounds.end - bounds.start < ASSISTANT_ASR_RATE / 4) return null;

    let mean = 0;
    for (let index = bounds.start; index < bounds.end; index++) mean += samples[index];
    mean /= bounds.end - bounds.start;

    let variance = 0;
    for (let index = bounds.start; index < bounds.end; index++) {
        const centered = samples[index] - mean;
        variance += centered * centered;
    }
    const deviation = Math.sqrt(variance / (bounds.end - bounds.start));
    if (deviation < 1e-5) return null;

    const normalized = new Float32Array(bounds.end - bounds.start);
    for (let index = bounds.start; index < bounds.end; index++) {
        normalized[index - bounds.start] = (samples[index] - mean) / deviation;
    }
    return normalized;
}

function assistantVoiceDecodeLogits(logits) {
    if (!logits || !Array.isArray(logits.dims) || logits.dims.length !== 3 || logits.dims[0] !== 1) {
        throw new Error('The speech model returned an invalid result');
    }

    const frameCount = logits.dims[1];
    const vocabularySize = logits.dims[2];
    let previousToken = -1;
    let transcript = '';

    for (let frame = 0; frame < frameCount; frame++) {
        let bestToken = 0;
        let bestScore = -Infinity;
        const offset = frame * vocabularySize;
        for (let token = 0; token < vocabularySize; token++) {
            const score = logits.data[offset + token];
            if (score > bestScore) {
                bestScore = score;
                bestToken = token;
            }
        }

        if (bestToken !== previousToken && bestToken !== ASSISTANT_ASR_BLANK) {
            const text = ASSISTANT_ASR_TOKENS[bestToken];
            if (text && text !== '[UNK]' && text !== '[PAD]') transcript += text === '|' ? ' ' : text;
        }
        previousToken = bestToken;
    }

    return transcript.replace(/\s+/g, ' ').trim();
}

async function assistantVoiceTranscribe(blob) {
    assistantVoiceStatus('جارٍ تفريغ التسجيل محليًا على جهازك…');
    const audio = await assistantVoicePrepareAudio(blob);
    if (!audio) {
        assistantVoiceStatus('لم أسمع كلامًا واضحًا. جرّب التسجيل مرة أخرى أو اكتب سؤالك.');
        return;
    }

    const session = await assistantVoiceLoadModel();
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    const input = new window.ort.Tensor('float32', audio, [1, audio.length]);
    const result = await session.run({ [inputName]: input });
    const transcript = assistantVoiceDecodeLogits(result[outputName]);
    if (!transcript) {
        assistantVoiceStatus('لم أتمكن من فهم التسجيل. جرّب مرة أخرى أو اكتب سؤالك.');
        return;
    }

    const field = document.getElementById('assistantInput');
    if (!field) throw new Error('The assistant input is unavailable');
    field.value = transcript.slice(0, 240);
    field.focus();
    assistantVoiceStatus('راجع النص وعدّله إن لزم، ثم اضغط إرسال. لم أرسل التسجيل أو النص تلقائيًا.');
}

function assistantVoiceStopRecording(discard = false) {
    if (!assistantVoiceRecorder || assistantVoiceRecorder.state !== 'recording') return;
    assistantVoiceDiscardRecording = discard;
    window.clearTimeout(assistantVoiceStopTimer);
    assistantVoiceRecorder.stop();
}

async function assistantVoiceBeginRecording() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Microphone access requires a supported browser and HTTPS');
    }
    if (typeof MediaRecorder !== 'function') throw new Error('MediaRecorder is not supported');

    assistantVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    assistantVoiceChunks = [];
    assistantVoiceDiscardRecording = false;
    const recorder = new MediaRecorder(assistantVoiceStream);
    assistantVoiceRecorder = recorder;
    recorder.addEventListener('dataavailable', event => {
        if (event.data && event.data.size) assistantVoiceChunks.push(event.data);
    });
    recorder.addEventListener('error', event => {
        console.error('Assistant microphone recording failed:', event.error);
        assistantVoiceStatus('تعذر تسجيل الصوت. تحقق من إذن الميكروفون ثم حاول مرة أخرى.');
        assistantVoiceStopRecording(true);
    });
    recorder.addEventListener('stop', async () => {
        const blob = new Blob(assistantVoiceChunks, { type: recorder.mimeType || 'audio/webm' });
        assistantVoiceChunks = [];
        if (assistantVoiceStream) {
            assistantVoiceStream.getTracks().forEach(track => track.stop());
            assistantVoiceStream = null;
        }
        assistantVoiceRecorder = null;
        assistantVoiceButton(false);
        if (assistantVoiceDiscardRecording) {
            assistantVoiceDiscardRecording = false;
            return;
        }

        assistantVoiceBusy = true;
        assistantVoiceButton(false, true);
        try {
            await assistantVoiceTranscribe(blob);
        } catch (error) {
            console.error('Assistant local speech transcription failed:', error);
            assistantVoiceStatus('تعذر تفريغ التسجيل محليًا. استخدم الكتابة أو حاول مرة أخرى.');
        } finally {
            assistantVoiceBusy = false;
            assistantVoiceButton(false);
            assistantVoiceMaybeReleaseSession();
        }
    }, { once: true });

    recorder.start();
    assistantVoiceButton(true);
    assistantVoiceStatus('جارٍ التسجيل. اضغط زر الإيقاف عند الانتهاء؛ سيتوقف تلقائيًا بعد 15 ثانية.');
    assistantVoiceStopTimer = window.setTimeout(() => assistantVoiceStopRecording(), ASSISTANT_ASR_MAX_RECORDING_MS);
}

async function startAssistantVoiceInput() {
    if (assistantVoiceRecorder && assistantVoiceRecorder.state === 'recording') {
        assistantVoiceStopRecording();
        return;
    }
    if (assistantVoiceBusy) return;
    if (!window.isSecureContext) {
        assistantVoiceStatus('يحتاج الميكروفون إلى اتصال آمن HTTPS. يمكنك استخدام الكتابة بدلًا منه.');
        return;
    }

    assistantVoiceBusy = true;
    assistantVoiceButton(false, true);
    try {
        const modelCached = await assistantVoiceHasCachedModel();
        if (!modelCached && !window.confirm('لتفعيل الإدخال الصوتي التجريبي، سيُنزل التطبيق مرة واحدة مشغل التعرف (11MB) ونموذجًا مصريًا مفتوح المصدر (Apache-2.0) بحجم 317MB من Hugging Face، ويتحقق من بصمته ثم يحفظه على جهازك. لن يبدأ الميكروفون قبل ضغطك عليه مرة أخرى، ولن يُرسل أي صوت أو نص إلى الخارج. هل تتابع؟')) {
            assistantVoiceStatus('لم يتم تنزيل النموذج. يمكنك استخدام الشات الكتابي في أي وقت.');
            return;
        }

        const sessionReady = Boolean(assistantAsrSession);
        assistantVoiceStatus(modelCached ? 'جارٍ تجهيز نموذج التعرف الصوتي محليًا…' : 'جارٍ تنزيل النموذج المفتوح لأول مرة…');
        await assistantVoiceLoadModel();
        if (!sessionReady) {
            assistantVoiceStatus('أصبح النموذج جاهزًا. اضغط زر الميكروفون مرة أخرى لبدء التسجيل.');
            return;
        }
        await assistantVoiceBeginRecording();
    } catch (error) {
        if (error && error.name === 'AbortError') {
            assistantVoiceStatus('تم إلغاء تنزيل النموذج. يمكنك استخدام الشات الكتابي.');
            await assistantVoiceSyncModelControls();
            return;
        }
        if (assistantVoiceStream && (!assistantVoiceRecorder || assistantVoiceRecorder.state !== 'recording')) {
            assistantVoiceStream.getTracks().forEach(track => track.stop());
            assistantVoiceStream = null;
        }
        console.error('Assistant voice input could not start:', error);
        assistantVoiceStatus('تعذر تجهيز الصوت. تحقق من الاتصال ومساحة التخزين وإذن الميكروفون، أو استخدم الكتابة.');
    } finally {
        assistantVoiceBusy = false;
        if (!assistantVoiceRecorder || assistantVoiceRecorder.state !== 'recording') assistantVoiceButton(false);
        assistantVoiceMaybeReleaseSession();
    }
}

function cancelAssistantVoiceDownload() {
    if (!assistantVoiceDownloadController) return;
    assistantVoiceStatus('جارٍ إلغاء تنزيل النموذج…');
    assistantVoiceDownloadController.abort();
}

async function deleteAssistantVoiceModel() {
    if (assistantVoiceBusy || assistantVoiceRecorder) {
        assistantVoiceStatus('أوقف التسجيل أو انتظر انتهاء التفريغ قبل حذف النموذج.');
        return;
    }
    try {
        if (!await assistantVoiceHasCachedModel()) {
            await assistantVoiceSyncModelControls();
            return;
        }
        if (!window.confirm('سيُحذف نموذج التعرف الصوتي (317MB) من الجهاز، ولن يعمل الميكروفون حتى تعيد تنزيله. هل تريد المتابعة؟')) return;
        await assistantVoiceDeleteCachedModel();
        if (assistantAsrSession) {
            const session = assistantAsrSession;
            assistantAsrSession = null;
            assistantAsrSessionPromise = null;
            await session.release();
        }
        await assistantVoiceSyncModelControls();
        assistantVoiceStatus('تم حذف نموذج الصوت من الجهاز. سيُطلب تنزيله مجددًا قبل استخدام الميكروفون.');
    } catch (error) {
        console.error('Assistant speech model deletion failed:', error);
        assistantVoiceStatus('تعذر حذف النموذج من مساحة المتصفح. يمكنك مسح بيانات الموقع من إعدادات المتصفح.');
    }
}

window.startAssistantVoiceInput = startAssistantVoiceInput;
window.cancelAssistantVoiceDownload = cancelAssistantVoiceDownload;
window.deleteAssistantVoiceModel = deleteAssistantVoiceModel;

void assistantVoiceSyncModelControls();

const assistantVoiceModal = document.getElementById('assistantModal');
if (assistantVoiceModal && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
        if (assistantVoiceModal.classList.contains('hidden')) {
            assistantVoiceStopRecording(true);
            if (assistantVoiceStream) {
                assistantVoiceStream.getTracks().forEach(track => track.stop());
                assistantVoiceStream = null;
            }
            assistantVoiceMaybeReleaseSession();
        }
    }).observe(assistantVoiceModal, { attributes: true, attributeFilter: ['class'] });
}

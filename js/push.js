// Web Push on this device: permission, subscription, and the row in push_subscriptions.
// Delivery is done by the send-push Edge Function; this file only manages the device side.
// Public VAPID key (safe to ship). Delivery needs the DB trigger, which is a separate approved step.
const PUSH_VAPID_PUBLIC_KEY = 'BDqVQhs-srV28ctgRroeeuOg6OTrwCgwaMF1EUZMh3vBoc_jP9YUK7uHSaUrlKlPsGo4lKmtYOlgbMvx-sRL_24';
const PUSH_ENABLED_FLAG = 'manzil_push_enabled';

function pushUrlBase64ToBytes(value) {
    const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function pushBytesToBase64Url(buffer) {
    let binary = '';
    new Uint8Array(buffer).forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pushIsSupported() {
    return typeof window !== 'undefined'
        && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function pushIsConfigured() {
    return Boolean(PUSH_VAPID_PUBLIC_KEY);
}

function pushWantedOnThisDevice() {
    try { return localStorage.getItem(PUSH_ENABLED_FLAG) === '1'; } catch (_error) { return false; }
}

function setPushWanted(value) {
    try {
        if (value) localStorage.setItem(PUSH_ENABLED_FLAG, '1');
        else localStorage.removeItem(PUSH_ENABLED_FLAG);
    } catch (_error) { /* storage can be blocked; the subscription still works for this session */ }
}

// 'unsupported' | 'unconfigured' | 'denied' | 'enabled' | 'disabled'
function getPushState() {
    if (!pushIsSupported()) return 'unsupported';
    if (!pushIsConfigured()) return 'unconfigured';
    if (Notification.permission === 'denied') return 'denied';
    return pushWantedOnThisDevice() && Notification.permission === 'granted' ? 'enabled' : 'disabled';
}

async function pushSaveSubscription(subscription) {
    if (!supabaseClient || !activeSession?.user?.id || !activeBuildingId) return false;
    const json = subscription.toJSON();
    const keys = json.keys || {};
    if (!json.endpoint || !keys.p256dh || !keys.auth) return false;
    const { error } = await supabaseClient.from('push_subscriptions').upsert({
        user_id: activeSession.user.id,
        building_id: activeBuildingId,
        endpoint: json.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: String(navigator.userAgent || '').slice(0, 200),
        last_seen_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    return !error;
}

async function pushDeleteSubscriptionRow(endpoint) {
    if (!supabaseClient || !activeSession?.user?.id || !endpoint) return;
    await supabaseClient.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', activeSession.user.id);
}

async function enablePush() {
    if (getPushState() === 'unsupported') {
        toast('هذا المتصفح لا يدعم الإشعارات. على الآيفون ثبّت التطبيق على الشاشة الرئيسية أولًا.', 'error');
        return false;
    }
    if (!pushIsConfigured()) {
        toast('الإشعارات الخارجية غير مفعّلة بعد على الخادم.', 'error');
        return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        toast('لم يتم السماح بالإشعارات. يمكنك تفعيلها من إعدادات المتصفح.', 'error');
        refreshPushControls();
        return false;
    }
    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: pushUrlBase64ToBytes(PUSH_VAPID_PUBLIC_KEY)
            });
        }
        const saved = await pushSaveSubscription(subscription);
        if (!saved) {
            toast('تعذر حفظ تفعيل الإشعارات. حاول مجددًا.', 'error');
            return false;
        }
        setPushWanted(true);
        toast('تم تفعيل الإشعارات على هذا الجهاز.', 'success');
        return true;
    } catch (error) {
        console.warn('Could not enable push notifications:', error);
        toast('تعذر تفعيل الإشعارات على هذا الجهاز.', 'error');
        return false;
    } finally {
        refreshPushControls();
    }
}

async function disablePush() {
    setPushWanted(false);
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await pushDeleteSubscriptionRow(subscription.endpoint);
            await subscription.unsubscribe();
        }
    } catch (error) {
        console.warn('Could not disable push notifications:', error);
    }
    toast('تم إيقاف الإشعارات على هذا الجهاز.', 'success');
    refreshPushControls();
}

async function togglePush() {
    if (getPushState() === 'enabled') await disablePush();
    else await enablePush();
}

// After sign-in: keep the stored subscription fresh for the signed-in user.
async function syncPushSubscription() {
    if (getPushState() !== 'enabled') return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await pushSaveSubscription(subscription);
        else setPushWanted(false);
    } catch (error) {
        console.warn('Could not refresh the push subscription:', error);
    }
}

// Before sign-out: stop this device from receiving the account's notifications.
// The browser permission stays, so signing in again re-registers it silently.
async function releasePushForSignOut() {
    if (!pushIsSupported() || !pushIsConfigured() || !pushWantedOnThisDevice()) return;
    try {
        // serviceWorker.ready never settles without a worker; do not block sign-out on it.
        const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise(resolve => setTimeout(() => resolve(null), 1500))
        ]);
        if (!registration) return;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await pushDeleteSubscriptionRow(subscription.endpoint);
    } catch (error) {
        console.warn('Could not release the push subscription:', error);
    }
}

function pushControlHtml() {
    const state = getPushState();
    if (state === 'unconfigured') return '';
    const text = {
        unsupported: 'الإشعارات خارج التطبيق غير متاحة في هذا المتصفح. على الآيفون ثبّت التطبيق على الشاشة الرئيسية.',
        denied: 'الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح.',
        enabled: 'الإشعارات مفعّلة على هذا الجهاز، وتصلك حتى والتطبيق مغلق.',
        disabled: 'فعّل الإشعارات لتصلك على هاتفك حتى والتطبيق مغلق.'
    }[state];
    const button = state === 'enabled' || state === 'disabled'
        ? `<button type="button" class="push-control-btn" onclick="togglePush()">${state === 'enabled' ? 'إيقاف الإشعارات' : 'تفعيل الإشعارات'}</button>`
        : '';
    return `<div class="push-control" data-push-state="${state}"><p class="text-xs text-slate-400">${text}</p>${button}</div>`;
}

// PWA install prompt for owners. Chrome/Edge on Android hand us an install
// event; iPhone and iPad have no event, so they get the Share-sheet steps.
const INSTALL_DISMISS_KEY = 'manzil.installCardDismissedAt';
const INSTALL_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
let deferredInstallPrompt = null;

function appIsInstalled() {
    try {
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (_) { /* matchMedia unavailable */ }
    return /** @type {any} */ (navigator).standalone === true;
}

function installIsAppleMobile() {
    const ua = String(navigator.userAgent || '');
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function installCardDismissed() {
    try {
        const at = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0);
        return at > 0 && Date.now() - at < INSTALL_DISMISS_MS;
    } catch (_) { return false; }
}

function installCardHtml() {
    if (appIsInstalled() || installCardDismissed()) return '';
    let body = '';
    if (deferredInstallPrompt) {
        body = '<p class="text-xs text-slate-400">ثبّت منزل على شاشتك الرئيسية لتفتحه بضغطة واحدة وتصلك الإشعارات.</p>'
            + '<button type="button" class="push-control-btn" onclick="installManzilApp()">تثبيت التطبيق</button>';
    } else if (installIsAppleMobile()) {
        body = '<p class="text-xs text-slate-400">لتثبيت التطبيق: اضغط زر المشاركة في سفاري، ثم «إضافة إلى الشاشة الرئيسية».</p>';
    } else {
        return '';
    }
    return `<div class="push-control" data-install-card="true">${body}<button type="button" class="inline-flex items-center justify-center min-h-11 min-w-11 text-xs text-slate-500" aria-label="إخفاء" onclick="dismissInstallCard()"><i class="fa-solid fa-xmark"></i></button></div>`;
}

async function installManzilApp() {
    const promptEvent = deferredInstallPrompt;
    if (!promptEvent) return;
    deferredInstallPrompt = null;
    try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
    } catch (error) {
        console.warn('Install prompt failed:', error);
    }
    refreshPushControls();
}

function dismissInstallCard() {
    try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch (_) { /* private mode */ }
    refreshPushControls();
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        refreshPushControls();
    });
    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        refreshPushControls();
    });
}

function refreshPushControls() {
    if (typeof renderManagerNotifications === 'function') renderManagerNotifications();
    if (currentUserRole === 'owner' && typeof renderOwnerPortal === 'function') renderOwnerPortal();
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type !== 'manzil-push-open') return;
        const target = String(event.data.path || '').trim();
        if (currentUserRole === 'manager' && target.startsWith('#') && typeof switchTab === 'function') {
            switchTab(target.slice(1).replace(/^tab-/, ''));
        } else if (currentUserRole === 'owner' && typeof focusOwnerNotifications === 'function') {
            focusOwnerNotifications();
        }
    });
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const swRegister = read('js/sw-register.js');
const css = read('css/style.css');
const state = read('js/state.js');
const auth = read('js/supabase.js');
const crud = read('js/crud.js');
const settings = read('js/settings.js');
const sw = read('sw.js');

test('settings are divided into accessible functional tabs', () => {
    for (const tab of ['building', 'payments', 'subscriptions', 'appearance', 'backup', 'receipts', 'reminders', 'account']) {
        assert.ok(html.includes('id="settings-tab-' + tab + '"'));
        assert.ok(html.includes('class="settings-card"'));
        assert.ok(html.includes('class="settings-card"'));
        assert.match(html, new RegExp('id="settings-panel-' + tab + '"'));
        assert.match(html, new RegExp('aria-controls="settings-panel-' + tab + '"'));
    }
    assert.match(settings, /function switchSettingsTab\(tab\)/);
    assert.match(settings, /function openSettingsModal\(\)[\s\S]*showSettingsOverview\(\)/);
});

test('settings use responsive cards and full-page section navigation', () => {
    for (const tab of ['building', 'payments', 'subscriptions', 'appearance', 'backup', 'receipts', 'reminders', 'account']) {
        assert.ok(html.includes('id="settings-tab-' + tab + '"'));
        assert.ok(html.includes('class="settings-card"'));
    }
    assert.match(html, /id="settingsOverview"/);
    assert.match(html, /id="settingsSectionToolbar"/);
    assert.ok(html.includes('onclick="showSettingsOverview()"'));
    assert.match(html, /id="settingsSaveButton"/);
    assert.ok(html.includes('settings-shell'), 'settings workspace keeps its dedicated shell');
    assert.ok(html.includes('id="settingsLayout"'), 'settings workspace exposes its view state');
    assert.ok(html.includes('class="settings-sidebar"'), 'settings navigation is grouped in a sidebar');
    assert.match(css, /\.settings-card-grid \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.settings-card \{\s*[\s\S]*?display: flex;\s*align-items: center;/);
    assert.match(css, /\.settings-overview \{\s*flex: 1 1 auto;\s*min-height: 0;[\s\S]*?overflow-y: auto;/);
    assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, 'wide screens show four spacious cards per row');
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.settings-sidebar \{\s*display: none;/, 'tablet and mobile collapse the sidebar');
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.settings-card-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'mobile keeps icon cards in two columns');
    assert.match(css, /\.settings-layout \{\s*[\s\S]*?grid-template-columns: minmax\(15rem, 18\.5rem\) minmax\(0, 1fr\);/, 'desktop uses a navigation column beside the content');
    assert.match(css, /\.settings-content \{[\s\S]*?overflow-y: auto;/, 'selected sections scroll independently');
    assert.match(settings, /function showSettingsOverview\(\)/);
    assert.match(settings, /function switchSettingsTab\(tab\)/);
});
 
test('all six themes are selectable, persisted and restored after authentication', () => {
    for (const theme of ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise']) {
        assert.match(html, new RegExp('data-theme-option="' + theme + '"'));
        assert.match(css, new RegExp('\\[data-theme="' + theme + '"\\]'));
        assert.ok(state.includes("'" + theme + "'"), 'state.js must support ' + theme);
        assert.ok(auth.includes("'" + theme + "'"), 'auth bootstrap must support ' + theme);
    }
    assert.match(state, /updateThemeSelection\(\)/);
    assert.match(settings, /SETTINGS_THEME_NAMES/);
});

test('settings redesign is included in the service worker cache version', () => {
    assert.match(html, /02:23 UTC/);
    assert.match(html, /04:23 شتاءً و05:23 صيفًا بتوقيت القاهرة/);
    assert.doesNotMatch(html, /نسخة يومية الساعة 04:23 صباحًا بتوقيت مصر/);
    assert.match(sw, /CACHE_NAME = 'manzil-v130'/);
    assert.match(css, /#settingsModal > \.settings-shell \{\s*width: min\(100%, 86rem\);[\s\S]*?height: min\(94dvh, 61rem\);/, 'settings workspace uses a generous centered shell');
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*?width: 100vw;[\s\S]*?height: 100dvh;/, 'mobile settings fill the viewport');
    assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, 'desktop uses a four-column card grid');
    assert.match(sw, /\.\/css\/style\.css/);
    assert.match(sw, /\.\/js\/state\.js/);
    assert.match(sw, /\.\/js\/settings\.js/);
    assert.match(sw, /\.\/js\/notices\.js/);
    assert.match(html, /js\/crud\.js[\s\S]*js\/notices\.js/);
    assert.match(html, /js\/crud\.js[\s\S]*js\/settings\.js/);
    assert.doesNotMatch(crud, /function openSettingsModal|function saveSettings|function switchSettingsTab/);
});


test('settings report a failed layout rollback even when the RPC has no transport error', async () => {
    const messages = [];
    let rpcCalls = 0;
    const elements = {
        settingsDefaultSub: { value: '0' },
        settingsStartingBalance: { value: '0' },
        settingsFloorCount: { value: '3' },
        settingsApartmentsPerFloor: { value: '4' },
        settingsBuildingName: { value: 'Building' },
        settingsManagerName: { value: 'Manager' },
        settingsManagerPhone: { value: '01000000000' },
        settingsSubscriptionDueDay: { value: '1' },
        settingsSubscriptionGraceDays: { value: '0' },
        settingsPaymentAllocationPolicy: { value: 'oldest_first' },
        settingsPaymentCashEnabled: { checked: true },
        settingsPaymentWalletEnabled: { checked: true },
        settingsWalletProvider: { value: '' },
        settingsWalletAccountName: { value: '' },
        settingsWalletNumber: { value: '' },
        settingsPaymentInstapayEnabled: { checked: true },
        settingsInstapayAccountName: { value: '' },
        settingsInstapayAddress: { value: '' },
        settingsPaymentBankEnabled: { checked: true },
        settingsBankName: { value: '' },
        settingsBankAccountName: { value: '' },
        settingsBankAccountNumber: { value: '' },
        settingsBankIban: { value: '' },
        settingsReceiptThankYou: { value: '' },
        settingsReminderTemplate: { value: '' }
    };
    const sandbox = {
        state: {},
        activeBuildingId: 'building-1',
        requireManager: () => true,
        normalizePaymentSettings: value => value,
        logAction() {},
        getIncomePaymentMethodLabel: value => value,
        document: { getElementById: id => elements[id] || null },
        cloneStateSnapshot: () => ({ floorCount: 2, apartmentsPerFloor: 4 }),
        supabaseClient: {
            rpc: async () => {
                rpcCalls += 1;
                return rpcCalls === 1
                    ? { data: { ok: true }, error: null }
                    : { data: { ok: false }, error: null };
            }
        },
        saveWithRollback: async () => false,
        toast: (message, type) => messages.push({ message, type })
    };
    const api = vm.runInNewContext(settings + String.fromCharCode(10) + '({ saveSettings })', sandbox, {
        filename: 'js/settings.js'
    });

    await api.saveSettings();

    assert.equal(rpcCalls, 2);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'error');
    assert.match(messages[0].message, /تعذر التراجع عن إعدادات الأدوار/);
});

test('receipt and reminder templates synchronize through building settings', () => {
    assert.ok(state.includes('state.receiptThankYouTemplate !== null'));
    assert.ok(state.includes('state.reminderMessageTemplate !== null'));
    assert.ok(auth.includes('receipt_thank_you_template,arrears_reminder_template'));
    assert.ok(auth.includes('receiptThankYouTemplate: building.receipt_thank_you_template ?? null'));
    assert.ok(auth.includes('reminderMessageTemplate: building.arrears_reminder_template ?? null'));
    assert.ok(settings.includes('receipt_thank_you_template: receiptThankYou || null'));
    assert.ok(settings.includes('arrears_reminder_template: reminderTemplate || null'));
    assert.ok(settings.includes('localStorage.removeItem(getReceiptSettingsKey())'));
    assert.ok(settings.includes('localStorage.removeItem(getReminderTemplateKey())'));
    assert.match(sw, /CACHE_NAME = 'manzil-v130'/);
});


test('settings cards open a full-page section and return to the overview', () => {
    assert.ok(html.includes("onclick=\"switchSettingsTab('payments')\""));
    assert.ok(html.includes('onclick="showSettingsOverview()"'));
    assert.ok(settings.includes("document.getElementById('settingsOverview')?.classList.add('hidden')"));
    assert.ok(settings.includes("document.getElementById('settingsSectionToolbar')?.classList.remove('hidden')"));
    assert.ok(settings.includes("document.getElementById('settingsSaveButton')?.classList.remove('hidden')"));
});


test('settings cards use a sidebar workspace with spacious scrollable section pages', () => {
    assert.ok(css.includes('grid-template-columns: minmax(15rem, 18.5rem) minmax(0, 1fr);'), 'desktop reserves a navigation column');
    assert.ok(css.includes('grid-template-columns: repeat(4, minmax(0, 1fr));'), 'desktop cards fill a four-column grid');
    assert.ok(css.includes('min-height: 8.6rem;'), 'desktop cards are large enough to read comfortably');
    assert.ok(css.includes('width: 3rem;') && css.includes('font-size: 1.2rem;'), 'desktop setting icons are enlarged');
    assert.ok(css.includes('width: 2.5rem;') && css.includes('font-size: 1rem;'), 'mobile setting icons stay clear');
    assert.ok(css.includes('overscroll-behavior: contain'), 'section content scrolls independently');
    assert.ok(css.includes('position: sticky;'), 'section toolbar and previews stay in view');
    assert.ok(css.includes('backdrop-filter: blur(14px);'), 'the section toolbar floats above the content');
    assert.ok(settings.includes("document.getElementById('settingsOverview')?.classList.add('hidden')"));
    assert.ok(settings.includes("document.getElementById('settingsSectionToolbar')?.classList.remove('hidden')"));
});


test('service worker refreshes cached assets from network and checks for updates automatically', () => {
    assert.ok(sw.includes("CACHE_NAME = 'manzil-v130'"));
    assert.ok(sw.includes("fetch(new Request(request, { cache: 'no-cache' }))"));
    assert.ok(sw.includes('.catch(() => caches.match(request))'));
    assert.ok(html.includes('<script src="js/sw-register.js"></script>'), 'index must load the registration script from the document head');
    assert.ok(swRegister.includes("updateViaCache: 'none'"), 'service worker registration must start in the document head before app initialization');
    assert.ok(swRegister.includes("addEventListener('controllerchange'"), 'controller changes must be observed before app initialization');
    assert.ok(swRegister.includes("addEventListener('pageshow'") && swRegister.includes("addEventListener('focus'") && swRegister.includes("addEventListener('visibilitychange'"), 'updates must be rechecked when the page becomes active');
    assert.doesNotMatch(read('js/app.js'), /serviceWorker\.register\(/, 'app initialization must not register a second service worker');
});


test('settings header uses the original Manzil app identity and unified visual system', () => {
    assert.match(html, /class="settings-topbar"/);
    assert.match(html, /class="settings-brand-lockup"/);
    assert.match(html, /src="icons\/manzil-logo\.png"/);
    assert.match(html, /منزل/);
    assert.match(html, /MANZIL/);
    assert.ok(css.includes('#settingsModal .settings-topbar'));
    assert.ok(css.includes('#159e9a'));
    assert.ok(css.includes('#123b50'));
    assert.ok(css.includes('#settingsModal .settings-section-heading'));
    assert.ok(css.includes('prefers-reduced-motion:reduce'));
});


test('appearance settings preview the original Manzil wordmark and app icon', () => {
    const appearance = html.slice(html.indexOf('id="settings-panel-appearance"'), html.indexOf('id="settings-panel-backup"'));
    assert.match(appearance, /settings-brand-preview/);
    assert.match(appearance, /src="icons\/manzil-brand\.svg"/);
    assert.match(appearance, /src="icons\/manzil-logo\.png"/);
    assert.match(appearance, /الشعار الرئيسي/);
    assert.match(appearance, /أيقونة التطبيق/);
    assert.ok(css.includes('#settingsModal .settings-brand-preview-grid'));
    assert.match(sw, /CACHE_NAME = 'manzil-v130'/);
});


test('payment method detail fields collapse when disabled and retain their values', () => {
    for (const [toggle, details] of [
        ['settingsPaymentWalletEnabled', 'settingsWalletDetails'],
        ['settingsPaymentInstapayEnabled', 'settingsInstapayDetails'],
        ['settingsPaymentBankEnabled', 'settingsBankDetails']
    ]) {
        assert.match(html, new RegExp('id="' + toggle + '"[^>]*aria-controls="' + details + '"'));
        assert.match(html, new RegExp('id="' + details + '"'));
    }
    assert.match(settings, /function syncPaymentMethodDetails\(\)/);
    assert.match(settings, /details\.hidden = !enabled/);
    assert.match(settings, /details\.classList\.toggle\('hidden', !enabled\)/);
    assert.match(settings, /disabled = !enabled/);
    assert.match(settings, /syncPaymentMethodDetails\(\);/);
    assert.match(sw, /CACHE_NAME = 'manzil-v130'/);
});


test('subscription settings show a live summary of due date, grace period, and allocation policy', () => {
    assert.match(html, /id="settingsSubscriptionRulePreview"/);
    assert.match(settings, /function renderSubscriptionRulePreview\(\)/);
    assert.match(settings, /field\.oninput = renderSubscriptionRulePreview/);
    assert.match(settings, /field\.onchange = renderSubscriptionRulePreview/);
    assert.match(settings, /موعد الاستحقاق/);
    assert.match(settings, /فترة السماح/);
    assert.match(settings, /توزيع الدفعات/);
    assert.ok(css.includes('#settingsModal .settings-subscription-summary'));
    assert.match(sw, /CACHE_NAME = 'manzil-v130'/);
});


test('building settings preview apartment totals and first/last floor numbering live', () => {
    assert.match(html, /id="settingsBuildingLayoutPreview"/);
    assert.match(settings, /function renderBuildingLayoutPreview\(\)/);
    assert.match(settings, /field\.oninput = renderBuildingLayoutPreview/);
    assert.match(settings, /field\.onchange = renderBuildingLayoutPreview/);
    assert.match(settings, /const total = floors \* apartmentsPerFloor/);
    assert.match(settings, /الدور الأول/);
    assert.match(settings, /الدور الأخير/);
    assert.ok(css.includes('#settingsModal .settings-building-layout-summary'));
    assert.match(sw, /CACHE_NAME = 'manzil-v130'/);
});


test('building settings are grouped into clear responsive sections without changing persisted field identifiers', () => {
    const building = html.slice(html.indexOf('id="settings-panel-building"'), html.indexOf('id="settings-panel-payments"'));
    for (const id of ['settingsBuildingInfoTitle', 'settingsBuildingLayoutTitle', 'settingsBuildingFinanceTitle']) {
        assert.ok(building.includes('id="' + id + '"'));
    }
    for (const id of ['settingsBuildingName', 'settingsManagerName', 'settingsManagerPhone', 'settingsFloorCount', 'settingsApartmentsPerFloor', 'settingsDefaultSub', 'settingsStartingBalance', 'settingsBuildingLayoutPreview']) {
        assert.ok(building.includes('id="' + id + '"'), 'existing settings field remains available: ' + id);
    }
    assert.equal((building.match(/id="settingsFloorCount"/g) || []).length, 1);
    assert.equal((building.match(/id="settingsApartmentsPerFloor"/g) || []).length, 1);
    assert.ok(css.includes('#settingsModal .settings-subsection'));
    assert.ok(css.includes('#settingsModal .settings-fields-grid'));
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/, 'grouped fields stack on narrow screens');
    assert.match(sw, /CACHE_NAME = 'manzil-v130'/);
});

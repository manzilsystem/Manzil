const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const settings = fs.readFileSync(path.join(__dirname, '..', 'js/settings.js'), 'utf8');

function createApi(query = '') {
    const elements = {
        settingsOwnerAccessList: { innerHTML: '' },
        settingsOwnerAccessSummary: { textContent: '' },
        settingsOwnerAccessSearch: { value: query }
    };
    const state = {
        residents: [
            { id: 'r1', name: 'أحمد', apartmentNumber: '12', phone: '01011111111', userId: 'user-1' },
            { id: 'r2', name: 'منى', apartmentNumber: '2', phone: '01022222222', userId: null },
            { id: 'r3', name: 'خالد', apartmentNumber: '3', phone: '', userId: null }
        ]
    };
    const sandbox = {
        state,
        document: { getElementById: id => elements[id] || null },
        esc: value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
    };
    const api = vm.runInNewContext(settings + '\n({ renderSettingsOwnerAccess })', sandbox);
    return { elements, render: api.renderSettingsOwnerAccess };
}

test('owner access settings summarize linked, pending and phone-missing accounts', () => {
    const { elements, render } = createApi();
    render();
    assert.match(elements.settingsOwnerAccessSummary.textContent, /3 شقة/);
    assert.match(elements.settingsOwnerAccessSummary.textContent, /1 حساب مرتبط/);
    assert.match(elements.settingsOwnerAccessSummary.textContent, /1 يحتاج إنشاء حساب/);
    assert.match(elements.settingsOwnerAccessSummary.textContent, /1 بدون هاتف/);
});

test('owner access search filters by resident name, apartment or phone', () => {
    const { elements, render } = createApi('01022222222');
    render();
    assert.match(elements.settingsOwnerAccessList.innerHTML, /منى/);
    assert.doesNotMatch(elements.settingsOwnerAccessList.innerHTML, /أحمد|خالد/);
});

test('owner access search shows a clear empty result without hiding account totals', () => {
    const { elements, render } = createApi('رقم غير موجود');
    render();
    assert.match(elements.settingsOwnerAccessList.innerHTML, /لا توجد نتائج مطابقة/);
    assert.match(elements.settingsOwnerAccessSummary.textContent, /3 شقة/);
});

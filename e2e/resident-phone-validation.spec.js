const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function openForm(page) {
    await loadShell(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof openResidentModal === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.floorCount = 3;
        state.apartmentsPerFloor = 2;
        state.residents = [];
        renderAll();
        switchTab('residents');
        openResidentModal('add');
    });
    await expect(page.locator('#residentModal')).toBeVisible();
}

const check = (page, owner, tenant, rented, requireOwner) => page.evaluate(([o, t, r, q]) => {
    document.getElementById('residentPhone').value = o;
    document.getElementById('residentIsRented').checked = r;
    toggleResidentTenantFields();
    document.getElementById('residentTenantPhone').value = t;
    const ok = validateResidentPhoneFields(q);
    return { ok, active: document.activeElement && document.activeElement.id, invalid: document.activeElement && document.activeElement.getAttribute('aria-invalid') };
}, [owner, tenant, rented, requireOwner]);

test('owner phone accepts Egyptian and international numbers and rejects wrong ones', async ({ page }) => {
    await openForm(page);
    for (const good of ['', '01012345678', '+201012345678', '00201012345678', '+44 7911 123456', '+1 (415) 555-2671', '٠١٠١٢٣٤٥٦٧٨']) {
        expect((await check(page, good, '', false, false)).ok, good).toBe(true);
    }
    for (const bad of ['123', 'abc', '0101234', '+0123456789', '+20101234567890123']) {
        const r = await check(page, bad, '', false, false);
        expect(r.ok, bad).toBe(false);
        expect(r.active).toBe('residentPhone');
        expect(r.invalid).toBe('true');
    }
    await expect(page.locator('#toastContainer')).toContainText('هاتف المالك غير صحيح');
});

test('tenant phone is validated only for rented apartments and the field is opened and focused', async ({ page }) => {
    await openForm(page);
    expect((await check(page, '', '12', false, false)).ok).toBe(true);
    const bad = await check(page, '', '12', true, false);
    expect(bad.ok).toBe(false);
    expect(bad.active).toBe('residentTenantPhone');
    await expect(page.locator('#residentTenantPhone')).toBeVisible();
    await expect(page.locator('#toastContainer')).toContainText('هاتف المستأجر غير صحيح');
    expect((await check(page, '', '+971 50 123 4567', true, false)).ok).toBe(true);
});

test('creating an owner account needs an owner phone and names the field', async ({ page }) => {
    await openForm(page);
    const r = await check(page, '', '', false, true);
    expect(r.ok).toBe(false);
    expect(r.active).toBe('residentPhone');
    await expect(page.locator('#toastContainer')).toContainText('أدخل هاتف المالك');
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw[0]).toBe(sw[1]);
});

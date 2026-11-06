const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const crud = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');

const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function loadAdjustmentHelpers(adjustments = []) {
    const resident = {
        id: 'r1', name: 'ساكن', apartmentNumber: '101', monthlyAmount: 100,
        createdAt: '2024-01-01T00:00:00.000Z',
        subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }]
    };
    const sandbox = {
        state: { adjustments, residents: [resident], income: [], defaultSubscription: 100 },
        monthsNames,
        document: { getElementById: () => null },
        getSubscriptionAmountForMonth: (target, month) => {
            const key = `2024-${String(monthsNames.indexOf(month.split(' ')[0]) + 1).padStart(2, '0')}-01`;
            const rates = (target.subscriptionRates || [])
                .filter(rate => rate.effectiveMonth <= key)
                .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
            return rates.length ? Number(rates[rates.length - 1].monthlyAmount) || 0 : 0;
        }
    };
    return vm.runInNewContext(
        `${crud}
        ({ resident: state.residents[0], getAdjustmentMonthDue, getAdjustedTotalForMonth,
           getResidentAdjustments, getAdjustmentKindLabel, adjustmentMonthKeyToLabel })`,
        sandbox,
        { filename: 'resident-adjustments-crud.js' }
    );
}

test('manager unit profile exposes the adjustment form and keeps it accessible', () => {
    assert.match(html, /id="adjustmentModal" role="dialog" aria-modal="true"/);
    assert.match(html, /aria-labelledby="adjustmentModalTitle"/);
    assert.match(html, /id="adjustmentListBody"/);
    assert.match(html, /id="adjustmentKind"[\s\S]*?<option value="waiver">إعفاء<\/option>[\s\S]*?<option value="discount">تخفيض<\/option>[\s\S]*?<option value="settlement">تسوية متفق عليها<\/option>/);
    assert.match(html, /id="adjustmentMonth" type="month"|type="month" id="adjustmentMonth"/);
    assert.match(html, /id="adjustmentAmount"/);
    assert.match(html, /id="adjustmentReason"/);
    assert.match(html, /id="adjustmentDueHint"[\s\S]*?aria-live="polite"/);
    assert.match(crud, /function openAdjustmentFromProfile\(residentId\)[\s\S]*?closeModal\('residentProfileModal'\);[\s\S]*?openAdjustmentModal\(residentId\)/);
    assert.match(crud, /onclick="openAdjustmentFromProfile\(\$\{residentArg\}\)"/);
});

test('adjustment helpers read the month entitlement and exclude the edited row', () => {
    const app = loadAdjustmentHelpers([
        { id: 'a1', residentId: 'r1', effectiveMonth: '2024-01-01', kind: 'waiver', amount: 20 },
        { id: 'a2', residentId: 'r1', effectiveMonth: '2024-01-01', kind: 'discount', amount: 10.5 },
        { id: 'a3', residentId: 'r1', effectiveMonth: '2024-02-01', kind: 'settlement', amount: 40 },
        { id: 'a4', residentId: 'r2', effectiveMonth: '2024-01-01', kind: 'waiver', amount: 15 }
    ]);

    assert.equal(app.getAdjustmentMonthDue(app.resident, '2024-01'), 100);
    assert.equal(app.getAdjustedTotalForMonth('r1', '2024-01'), 30.5);
    assert.equal(app.getAdjustedTotalForMonth('r1', '2024-01', 'a1'), 10.5);
    assert.equal(app.getResidentAdjustments('r1')[0].id, 'a3');
    assert.equal(app.getAdjustmentKindLabel('waiver'), 'إعفاء');
    assert.equal(app.getAdjustmentKindLabel('discount'), 'تخفيض');
    assert.equal(app.getAdjustmentKindLabel('settlement'), 'تسوية');
    assert.equal(app.adjustmentMonthKeyToLabel('2024-03'), 'مارس 2024');
});

test('saving an adjustment validates the month, amount, reason and monthly cap', () => {
    assert.match(crud, /function handleAdjustmentSubmit\(event\)/);
    assert.match(crud, /!ADJUSTMENT_FORM_KINDS\.includes\(kind\)/);
    assert.match(crud, /!isValidEffectiveMonth\(monthKey\)/);
    assert.match(crud, /monthKey < createdMonth/);
    assert.match(crud, /!Number\.isFinite\(amount\) \|\| amount <= 0/);
    assert.match(crud, /!reason/);
    assert.match(crud, /dueCents <= 0/);
    assert.match(crud, /existingDiscounts \+ amountCents > dueCents/);
    assert.match(crud, /amountCents = Math\.round\(amount \* 100\)/);
});

test('adjustment writes go through the atomic snapshot and the audit log', () => {
    assert.ok(crud.includes("logAction('إضافة ' + getAdjustmentKindLabel(kind)"));
    assert.ok(crud.includes("logAction('تعديل ' + getAdjustmentKindLabel(kind)"));
    assert.ok(crud.includes("logAction('حذف ' + getAdjustmentKindLabel(adjustment.kind)"));
    assert.match(crud, /saveWithRollback\(previousState\)/);
    assert.match(crud, /confirmRecordDeletion\(/);
    assert.match(crud, /function deleteAdjustment\(id\)/);
    assert.match(crud, /function editAdjustment\(id\)/);
    assert.match(crud, /function cancelAdjustmentEdit\(\)/);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}
function load() {
    return vm.runInNewContext(
        `${source}\n({ state, buildArrearsReport })`,
        { Date: FixedDate },
        { filename: 'js/state.js' }
    );
}

function resident(id, apartmentNumber, createdAt = '2024-01-01T00:00:00.000Z') {
    return {
        id, name: `Resident ${apartmentNumber}`, apartmentNumber, createdAt,
        monthlyAmount: 100,
        subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }]
    };
}

test('arrears report filters by apartment', () => {
    const app = load();
    app.state.residents = [resident('r1', '1'), resident('r2', '2')];
    app.state.income = [{ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100 }];
    const report = app.buildArrearsReport({ residentId: 'r1' });
    assert.equal(report.residents.length, 1);
    assert.equal(report.residents[0].resident.id, 'r1');
});

test('arrears report filters unpaid months by inclusive period boundaries', () => {
    const app = load();
    app.state.residents = [resident('r1', '1')];
    app.state.income = [
        { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100 },
        { id: 'i2', residentId: 'r1', month: 'أبريل 2024', amount: 100 }
    ];
    const report = app.buildArrearsReport({ fromMonth: '2024-02', toMonth: '2024-03' });
    assert.deepEqual(JSON.parse(JSON.stringify(report.residents[0].unpaidMonths.map(x => x.month))), ['فبراير 2024', 'مارس 2024']);
    assert.equal(report.totalDebt, 200);
});

test('arrears report filters by overdue status after applying period and apartment filters', () => {
    const app = load();
    app.state.residents = [
        resident('r1', '1', '2024-04-01T00:00:00.000Z'),
        resident('r2', '2', '2024-01-01T00:00:00.000Z')
    ];
    app.state.income = [
        { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100 },
        { id: 'i2', residentId: 'r2', month: 'يناير 2024', amount: 100 }
    ];
    const report = app.buildArrearsReport({ status: 'four_plus' });
    assert.equal(report.residents.length, 1);
    assert.equal(report.residents[0].resident.id, 'r2');
    assert.equal(report.residents[0].bucket, '4 أشهر فأكثر');
});

test('invalid arrears date ranges return an empty report with a validation flag', () => {
    const app = load();
    app.state.residents = [resident('r1', '1')];
    const report = app.buildArrearsReport({ fromMonth: '2024-04', toMonth: '2024-02' });
    assert.equal(report.invalidRange, true);
    assert.equal(report.residents.length, 0);
});

test('arrears UI exposes apartment, period, and status filters and exports the filtered report', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const render = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
    const crud = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');
    for (const id of ['arrearsApartmentFilter', 'arrearsFromMonth', 'arrearsToMonth', 'arrearsStatusFilter']) {
        assert.ok(html.includes(`id="${id}"`), id);
    }
    assert.match(render, /function getArrearsReportFilters/);
    assert.match(crud, /buildArrearsReport\(getArrearsReportFilters\(\)\)/);
});

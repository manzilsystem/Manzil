const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');

function loadExporter(state) {
    const downloads = [];
    const sandbox = {
        state,
        requireManager: () => true,
        Blob: class {
            constructor(parts) { this.parts = parts; }
        },
        URL: {
            createObjectURL: blob => { downloads.push(blob.parts.join('')); return 'blob:test'; },
            revokeObjectURL: () => {},
        },
        setTimeout: callback => { callback(); return 0; },
        document: {
            createElement: () => ({
                click: () => {},
            }),
        },
    };
    const app = vm.runInNewContext(`${source}\n({ exportToCSV })`, sandbox, { filename: 'js/crud.js' });
    return { exportToCSV: app.exportToCSV, downloads };
}

test('CSV export leaves missing optional expense fields blank instead of writing undefined', () => {
    const { exportToCSV, downloads } = loadExporter({
        residents: [],
        income: [],
        expenses: [{ title: 'مصروف قديم', month: 'يناير 2024', amount: 25 }],
    });

    exportToCSV();
    const csv = downloads[0];
    assert.ok(csv.endsWith('"مصروف","مصروف قديم","","يناير 2024","25",""'));
    assert.doesNotMatch(csv, /undefined/);
});

test('CSV export preserves existing expense category and notes', () => {
    const { exportToCSV, downloads } = loadExporter({
        residents: [],
        income: [],
        expenses: [{ title: 'صيانة', category: 'كهرباء', notes: 'فاتورة', month: 'يناير 2024', amount: 25 }],
    });

    exportToCSV();
    assert.match(downloads[0], /"صيانة","","يناير 2024","25","كهرباء فاتورة"/);
});

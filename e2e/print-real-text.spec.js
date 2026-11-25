const { test, expect } = require('@playwright/test');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadShell } = require('./helpers');

// "طباعة PDF" is the real-text path: the browser prints only the report card, so "Save as PDF"
// keeps selectable Arabic text in the bundled Cairo font. Only the image export is a picture.
const REPORTS = [
    { nav: 'landlord', card: '#landlordReportPrint', gen: "generateLandlordReport()", print: 'printLandlordReport()', cls: 'print-landlord', btn: 'reportPrintBtn' },
    { nav: 'period', card: '#periodReportCard', gen: 'generatePeriodReport()', print: 'printPeriodReport()', cls: 'print-period', btn: 'periodReportPrintBtn' },
    { nav: 'cashflow', card: '#cashFlowPanel', gen: 'generateCashFlowReport()', print: 'printCashFlowReport()', cls: 'print-cashflow', btn: 'cashFlowPrintBtn' },
    { nav: 'expenses', card: '#expensesReportCard', gen: 'generateExpensesReport()', print: 'printExpensesReport()', cls: 'print-expenses', btn: 'expensesReportPrintBtn' },
    { nav: 'adjustments', card: '#adjustmentsReportCard', gen: 'generateAdjustmentsReport()', print: 'printAdjustmentsReport()', cls: 'print-adjustments', btn: 'adjustmentsReportPrintBtn' },
    { nav: 'apartments', card: '#apartmentsPanel', gen: 'generateApartmentsReport()', print: 'printApartmentsReport()', cls: 'print-apartments', btn: 'apartmentsPrintBtn' },
    { nav: 'paymentBehavior', card: '#paymentBehaviorPanel', gen: 'generatePayerBehaviorReport()', print: 'printPayerBehaviorReport()', cls: 'print-payment-behavior', btn: 'paymentBehaviorPrintBtn' },
    { nav: 'expenseVariance', card: '#expenseVariancePanel', gen: 'generateExpenseVarianceReport()', print: 'printExpenseVarianceReport()', cls: 'print-expense-variance', btn: 'expenseVariancePrintBtn' },
    { nav: 'paymentMethods', card: '#paymentMethodsPanel', gen: 'generatePaymentMethodsReport()', print: 'printPaymentMethodsReport()', cls: 'print-payment-methods', btn: 'paymentMethodsPrintBtn' }
];

async function seed(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة النور'; state.managerName = 'محمد عادل';
        const names = ['أحمد سمير', 'سعيد علي', 'منى حسن', 'خالد يوسف', 'هبة مصطفى', 'عمر فتحي'];
        state.residents = names.map((n, i) => ({ id: 'r' + i, name: n, apartmentNumber: String(i + 1), monthlyAmount: 150, createdAt: '2024-01-01T00:00:00.000Z' }));
        const months = ['يناير 2024', 'فبراير 2024', 'مارس 2024', 'أبريل 2024'];
        state.income = []; let k = 0;
        state.residents.forEach((r, i) => months.forEach((m, j) => { if ((i + j) % 3 !== 0) state.income.push({ id: 'i' + (k++), residentId: r.id, month: m, amount: 150, paymentMethod: j % 2 ? 'cash' : 'instapay' }); }));
        state.expenses = [
            { id: 'e1', month: 'يناير 2024', title: 'كهرباء السلالم', amount: 220, category: 'مرافق', cashAccountCode: 'main' },
            { id: 'e2', month: 'فبراير 2024', title: 'صيانة الأسانسير', amount: 600, category: 'صيانة', cashAccountCode: 'main' },
            { id: 'e3', month: 'مارس 2024', title: 'دهان المدخل', amount: 900, category: 'تطوير', cashAccountCode: 'development' },
            { id: 'e4', month: 'أبريل 2024', title: 'نظافة', amount: 300, category: 'نظافة', cashAccountCode: 'main' }
        ];
        state.adjustments = [{ id: 'a1', residentId: 'r1', kind: 'waiver', effectiveMonth: '2024-02-01', amount: 100, reason: 'حالة وفاة' }];
        renderAll();
    });
    await page.evaluate(() => switchTab('reports'));
}

async function pickRange(page) {
    await page.evaluate(() => {
        document.querySelectorAll('#tab-reports select').forEach(sel => {
            const opts = [...sel.options].map(o => o.value);
            if (/From$/.test(sel.id) && opts.includes('يناير 2024')) sel.value = 'يناير 2024';
            else if (/To$/.test(sel.id) && opts.includes('أبريل 2024')) sel.value = 'أبريل 2024';
            else if (/Month$/.test(sel.id) && opts.includes('مارس 2024')) sel.value = 'مارس 2024';
        });
    });
}

for (const paper of ['A4', 'A5']) {
    test(`print output is real Arabic text, report only, RTL, Cairo, ${paper}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'print layout does not depend on the viewport');
        test.setTimeout(240_000);
        await seed(page);
        await page.evaluate(p => setPrintPaper(p), paper);
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manzil-print-'));
        const hasPdftotext = spawnSync('pdftotext', ['-v']).error === undefined;
        for (const r of REPORTS) {
            await test.step(r.nav, async () => {
                await page.evaluate(() => { document.body.className = document.body.className.split(/\s+/).filter(c => !c.startsWith('print-')).join(' '); });
                await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1440, height: 900 });
                await page.evaluate(n => { if (typeof showReportIndex === 'function') showReportIndex(); switchReportTab(n); }, r.nav);
                await pickRange(page);
                await page.evaluate(g => (0, eval)(g), r.gen); await expect(page.locator(`#${r.btn}`)).toBeEnabled();
                // window.print is stubbed so the print classes stay on while Playwright prints.
                await page.evaluate(code => { window.print = () => {}; (0, eval)(code); }, r.print);
                expect(await page.evaluate(() => [...document.body.classList].filter(c => c.startsWith('print-')))).toContain(r.cls);
                await page.emulateMedia({ media: 'print' });
                // lay the page out at the printable width (paper minus the 14mm @page margins)
                await page.setViewportSize({ width: Math.round(((paper === 'A4' ? 210 : 148) - 28) * 96 / 25.4), height: 1000 });
                const facts = await page.evaluate(sel => {
                    const card = document.querySelector(sel);
                    const visibleSections = [...document.querySelectorAll('#printableArea > section')]
                        .filter(s => getComputedStyle(s).display !== 'none').map(s => s.id);
                    const siblings = [...document.querySelectorAll('#tab-reports > *')]
                        .filter(el => !el.contains(card) && getComputedStyle(el).display !== 'none').map(el => el.id || el.className);
                    const cs = getComputedStyle(card);
                    return { dir: getComputedStyle(document.documentElement).direction, font: cs.fontFamily, text: card.innerText.trim().length, visibleSections, siblings };
                }, r.card);
                // nothing may run past the printable width: a clipped column is lost data on paper
                const clipped = await page.evaluate(sel => {
                    const card = document.querySelector(sel);
                    const limit = document.documentElement.clientWidth;
                    const out = [];
                    card.querySelectorAll('table, .report-stats, .report-stat, th, td').forEach(el => {
                        const b = el.getBoundingClientRect();
                        if (b.width && (b.left < -1 || b.right > limit + 1)) out.push((el.id || el.tagName + '.' + String(el.className).split(' ')[0]) + ':' + Math.round(b.left) + '..' + Math.round(b.right));
                    });
                    return { limit, out: out.slice(0, 6) };
                }, r.card);
                expect(clipped.out).toEqual([]);
                expect(facts.visibleSections).toEqual(['tab-reports']);
                expect(facts.siblings).toEqual([]);
                expect(facts.dir).toBe('rtl');
                expect(facts.font).toMatch(/Cairo/i);
                expect(facts.text).toBeGreaterThan(40); const pdf = await page.pdf({ preferCSSPageSize: true });
                const raw = pdf.toString('latin1');
                const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
                expect([Math.round(+box[1]), Math.round(+box[2])]).toEqual(paper === 'A4' ? [595, 842] : [420, 595]);
                expect(raw).toMatch(/\/Type\s*\/Font/);
                expect(raw).not.toMatch(/\/Subtype\s*\/Image/);
                if (hasPdftotext) {
                    const file = path.join(tmp, `${r.nav}-${paper}.pdf`);
                    fs.writeFileSync(file, pdf); const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
                    expect(text).toMatch(/[\u0600-\u06FF]{3,}/);
                    expect(text).not.toMatch(/\uFFFD/);
                }
            });
        }
    });
}

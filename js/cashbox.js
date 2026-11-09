// @ts-check
const CASH_ACCOUNTS = Object.freeze({
    main: { label: 'الخزنة الرئيسية', shortLabel: 'الرئيسية' },
    development: { label: 'صندوق التطوير', shortLabel: 'التطوير' },
    emergency: { label: 'صندوق الصيانة الطارئة', shortLabel: 'الطوارئ' }
});

let cashTransferSaving = false;
let cashTransferPendingRequestId = null;
let cashTransferPendingPayload = null;
let cashTransferPendingBuildingId = null;
let persistedCashTotals = null;

function cashTransferPendingStorageKey(buildingId) {
    return 'manzil:cash-transfer-pending:' + buildingId;
}

function clearCashTransferPending(buildingId) {
    try { sessionStorage.removeItem(cashTransferPendingStorageKey(buildingId)); } catch { /* Storage unavailable. */ }
    if (cashTransferPendingBuildingId === buildingId) {
        cashTransferPendingRequestId = null;
        cashTransferPendingPayload = null;
        cashTransferPendingBuildingId = null;
    }
}

function clearCashTransferPendingMemory(buildingId) {
    if (cashTransferPendingBuildingId === buildingId) {
        cashTransferPendingRequestId = null;
        cashTransferPendingPayload = null;
        cashTransferPendingBuildingId = null;
    }
}

function getCashAccountLabel(code) {
    return CASH_ACCOUNTS[code]?.label || CASH_ACCOUNTS.main.label;
}

function getCashAccountBalance(code) {
    const value = Number(state.cashAccountBalances?.[code]);
    return Number.isFinite(value) ? value : 0;
}

function hasValidCashboxBalances(balances) {
    if (!balances || typeof balances !== 'object' || Array.isArray(balances)) return false;
    const accountCodes = Object.keys(CASH_ACCOUNTS);
    const balanceCodes = Object.keys(balances);
    return balanceCodes.length === accountCodes.length &&
        accountCodes.every(code =>
            Object.prototype.hasOwnProperty.call(balances, code) &&
            typeof balances[code] === 'number' &&
            Number.isFinite(balances[code]) &&
            (code === 'main' || balances[code] >= 0)
        );
}

function normalizeCashboxSummary(summary) {
    const invalid = () => { throw new Error('Invalid cashbox summary from server'); };
    if (!summary || typeof summary !== 'object' || Array.isArray(summary) ||
        !hasValidCashboxBalances(summary.balances) || !Array.isArray(summary.transfers)) {
        return invalid();
    }

    const transferIds = new Set();
    const transfers = summary.transfers.map(transfer => {
        if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer) ||
            typeof transfer.id !== 'string' || !transfer.id.trim() || transferIds.has(transfer.id) ||
            !CASH_ACCOUNTS[transfer.from_account_code] ||
            !CASH_ACCOUNTS[transfer.to_account_code] ||
            transfer.from_account_code === transfer.to_account_code ||
            (typeof transfer.amount !== 'number' &&
                !(typeof transfer.amount === 'string' && transfer.amount.trim() !== '')) ||
            !Number.isFinite(Number(transfer.amount)) || Number(transfer.amount) <= 0 ||
            typeof transfer.transferred_at !== 'string' ||
            !transfer.transferred_at.trim() ||
            !Number.isFinite(Date.parse(transfer.transferred_at)) ||
            (transfer.notes !== undefined && transfer.notes !== null && typeof transfer.notes !== 'string')) {
            return invalid();
        }
        transferIds.add(transfer.id);
        return { ...transfer, amount: Number(transfer.amount) };
    });

    return {
        balances: {
            main: summary.balances.main,
            development: summary.balances.development,
            emergency: summary.balances.emergency
        },
        transfers
    };
}

function parseCashboxVersion(value) {
    if (typeof value !== 'number' &&
        !(typeof value === 'string' && value.trim() !== '')) return null;
    const version = Number(value);
    return Number.isSafeInteger(version) && version >= 1 ? version : null;
}

function calculateCashboxAccountingTotals() {
    const cents = value => {
        const amount = Number(value);
        return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
    };
    const byAccount = () => Object.keys(CASH_ACCOUNTS).reduce((totals, code) => {
        totals[code] = 0;
        return totals;
    }, {});
    const totals = {
        startingBalance: cents(state.startingBalance),
        income: byAccount(),
        expenses: byAccount()
    };
    const addToAccount = (buckets, row) => {
        const code = CASH_ACCOUNTS[row.cashAccountCode] ? row.cashAccountCode : 'main';
        buckets[code] += cents(row.amount);
    };
    state.income.forEach(income => addToAccount(totals.income, income));
    state.expenses.forEach(expense => addToAccount(totals.expenses, expense));
    return totals;
}

function initializeCashboxAccountingSnapshot() {
    persistedCashTotals = calculateCashboxAccountingTotals();
}

function syncCashboxBalancesAfterSnapshot() {
    const next = calculateCashboxAccountingTotals();
    if (!persistedCashTotals) {
        persistedCashTotals = next;
        return false;
    }

    const previous = persistedCashTotals;
    const balances = state.cashAccountBalances || { main: 0, development: 0, emergency: 0 };
    for (const code of Object.keys(CASH_ACCOUNTS)) {
        const startingDelta = code === 'main' ? next.startingBalance - previous.startingBalance : 0;
        balances[code] = (Math.round((Number(balances[code]) || 0) * 100)
            + startingDelta
            + next.income[code] - previous.income[code]
            - next.expenses[code] + previous.expenses[code]) / 100;
    }
    state.cashAccountBalances = balances;
    persistedCashTotals = next;
    return true;
}

function cashMonthLabelFromIso(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : `${monthsNames[date.getMonth()]} ${date.getFullYear()}`;
}

function getCashboxSummaryMonth() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('cashboxSummaryMonth'));
    return select?.value || getCurrentMonth();
}

function calculateFundMovement(month) {
    const totals = Object.keys(CASH_ACCOUNTS).reduce((result, code) => {
        result[code] = { income: 0, expenses: 0, transfersIn: 0, transfersOut: 0 };
        return result;
    }, /** @type {Record<string, { income: number, expenses: number, transfersIn: number, transfersOut: number }>} */ ({}));
    const add = (code, kind, amount) => {
        const bucket = totals[CASH_ACCOUNTS[code] ? code : 'main'];
        const value = Number(amount);
        if (Number.isFinite(value) && value > 0) bucket[kind] += Math.round(value * 100);
    };
    state.income.forEach(item => {
        if (item.month === month) add(item.cashAccountCode, 'income', item.amount);
    });
    state.expenses.forEach(item => {
        if (item.month === month) add(item.cashAccountCode, 'expenses', item.amount);
    });
    (Array.isArray(state.cashTransfers) ? state.cashTransfers : []).forEach(item => {
        if (cashMonthLabelFromIso(item.transferredAt) !== month) return;
        add(item.fromAccountCode, 'transfersOut', item.amount);
        add(item.toAccountCode, 'transfersIn', item.amount);
    });
    return totals;
}

function renderCashboxMovementSummary() {
    const container = document.getElementById('cashboxSummaryRows');
    if (!container) return;
    const month = getCashboxSummaryMonth();
    const totals = calculateFundMovement(month);
    container.innerHTML = Object.keys(CASH_ACCOUNTS).map(code => {
        const bucket = totals[code];
        const transfers = bucket.transfersIn - bucket.transfersOut;
        const net = bucket.income + transfers - bucket.expenses;
        const netClass = net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-300';
        return `
            <article class="app-input border rounded-2xl p-3 space-y-2">
                <div class="flex justify-between items-center gap-2">
                    <strong class="text-xs">${esc(getCashAccountLabel(code))}</strong>
                    <strong class="${netClass} whitespace-nowrap">${fmtNum(net / 100)} ج.م</strong>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center text-[10px] text-slate-400">
                    <div><span class="block font-bold text-emerald-400">${fmtNum(bucket.income / 100)}</span>تحصيلات</div>
                    <div><span class="block font-bold text-rose-400">${fmtNum(bucket.expenses / 100)}</span>مصروفات</div>
                    <div><span class="block font-bold ${transfers >= 0 ? 'text-indigo-300' : 'text-amber-300'}">${fmtNum(Math.abs(transfers) / 100)}</span>${transfers >= 0 ? 'صافي وارد' : 'صافي صادر'}</div>
                </div>
                <p class="text-[10px] text-slate-400">تحويلات داخلة: <span class="font-bold text-indigo-300">${fmtNum(bucket.transfersIn / 100)}</span> ج.م · تحويلات خارجة: <span class="font-bold text-amber-300">${fmtNum(bucket.transfersOut / 100)}</span> ج.م</p>
            </article>
        `;
    }).join('') + `<p class="text-[10px] text-slate-500">صافي الحركة = التحصيلات + التحويلات الواردة − المصروفات − التحويلات الصادرة. التحويلات الداخلية لا تُحسب إيرادًا أو مصروفًا.</p>`;
}

function buildCashboxMovements() {
    const movements = [];
    const accountOf = code => (CASH_ACCOUNTS[code] ? code : 'main');
    (Array.isArray(state.income) ? state.income : []).forEach(item => {
        movements.push({
            id: `income:${item.id}`,
            accountCode: accountOf(item.cashAccountCode),
            kind: 'income',
            label: 'تحصيل',
            amount: Number(item.amount) || 0,
            direction: 1,
            at: item.date,
            notes: item.notes || ''
        });
    });
    (Array.isArray(state.expenses) ? state.expenses : []).forEach(item => {
        movements.push({
            id: `expense:${item.id}`,
            accountCode: accountOf(item.cashAccountCode),
            kind: 'expense',
            label: 'مصروف',
            amount: Number(item.amount) || 0,
            direction: -1,
            at: item.date,
            notes: item.notes || item.title || ''
        });
    });
    (Array.isArray(state.cashTransfers) ? state.cashTransfers : []).forEach(item => {
        const amount = Number(item.amount) || 0;
        if (CASH_ACCOUNTS[item.fromAccountCode]) {
            movements.push({
                id: `transfer-out:${item.id}`,
                accountCode: item.fromAccountCode,
                kind: 'transfer-out',
                label: 'تحويل صادر',
                amount,
                direction: -1,
                at: item.transferredAt,
                notes: item.notes || ''
            });
        }
        if (CASH_ACCOUNTS[item.toAccountCode]) {
            movements.push({
                id: `transfer-in:${item.id}`,
                accountCode: item.toAccountCode,
                kind: 'transfer-in',
                label: 'تحويل وارد',
                amount,
                direction: 1,
                at: item.transferredAt,
                notes: item.notes || ''
            });
        }
    });
    return movements.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
}

function getCashboxMovementsAccountFilter() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('cashboxMovementsAccount'));
    return select?.value || 'all';
}

function renderCashboxRecentMovements() {
    const container = document.getElementById('cashboxRecentMovements');
    if (!container) return;
    const account = getCashboxMovementsAccountFilter();
    const movements = buildCashboxMovements()
        .filter(item => account === 'all' || item.accountCode === account)
        .slice(0, 10);
    if (!movements.length) {
        container.innerHTML = '<p class="text-center text-xs text-slate-500 py-5">لا توجد حركات مسجلة حتى الآن.</p>';
        return;
    }
    container.innerHTML = movements.map(item => {
        const positive = item.direction > 0;
        const kindTone = item.kind === 'income' ? 'text-emerald-400'
            : item.kind === 'expense' ? 'text-rose-400'
                : 'text-indigo-300';
        return `
            <article class="app-input border rounded-2xl p-3 flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-1">
                    <p class="text-xs font-bold"><span class="${kindTone}">${esc(item.label)}</span> · ${esc(getCashAccountLabel(item.accountCode))}</p>
                    <p class="text-[10px] text-slate-500">${formatDate(item.at)}${item.notes ? ` · ${esc(item.notes)}` : ''}</p>
                </div>
                <strong class="text-sm ${positive ? 'text-emerald-400' : 'text-rose-400'} whitespace-nowrap">${positive ? '+' : '−'}${fmtNum(item.amount)} ج.م</strong>
            </article>
        `;
    }).join('');
}

function renderCashbox() {
    if (currentUserRole !== 'manager') return;

    for (const code of Object.keys(CASH_ACCOUNTS)) {
        const element = document.getElementById(`cashBalance-${code}`);
        if (element) element.textContent = `${fmtNum(getCashAccountBalance(code))} ج.م`;
    }

    const totalBalance = Object.keys(CASH_ACCOUNTS)
        .reduce((sum, code) => sum + getCashAccountBalance(code), 0);
    const totalElement = document.getElementById('cashBalance-total');
    if (totalElement) totalElement.textContent = `${fmtNum(totalBalance)} ج.م`;

    renderCashboxMovementSummary();
    renderCashboxRecentMovements();

    const list = document.getElementById('cashTransfersList');
    if (!list) return;
    const transfers = Array.isArray(state.cashTransfers) ? state.cashTransfers : [];
    if (!transfers.length) {
        list.innerHTML = '<p class="text-center text-xs text-slate-500 py-5">لا توجد تحويلات مسجلة حتى الآن.</p>';
        return;
    }

    list.innerHTML = transfers.map(transfer => {
        const fromLabel = getCashAccountLabel(transfer.fromAccountCode);
        const toLabel = getCashAccountLabel(transfer.toAccountCode);
        return `
            <article class="app-input border rounded-2xl p-3 flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-1">
                    <p class="text-xs font-bold">${esc(fromLabel)} <i class="fa-solid fa-arrow-left-long mx-1 text-indigo-400"></i> ${esc(toLabel)}</p>
                    <p class="text-[10px] text-slate-500">${formatDate(transfer.transferredAt)}${transfer.notes ? ` · ${esc(transfer.notes)}` : ''}</p>
                </div>
                <strong class="text-sm text-indigo-300 whitespace-nowrap">${fmtNum(transfer.amount)} ج.م</strong>
            </article>
        `;
    }).join('');
}

function previewCashTransfer() {
    const preview = document.getElementById('cashTransferPreview');
    const summary = document.getElementById('cashTransferPreviewText');
    const submit = /** @type {HTMLButtonElement} */ (document.getElementById('cashTransferSubmitButton'));
    const from = /** @type {HTMLSelectElement} */ (document.getElementById('cashTransferFrom'))?.value || '';
    const to = /** @type {HTMLSelectElement} */ (document.getElementById('cashTransferTo'))?.value || '';
    const amount = Number(/** @type {HTMLInputElement} */ (document.getElementById('cashTransferAmount'))?.value);
    const validAmount = Number.isFinite(amount) && amount > 0;
    const validAccounts = Boolean(CASH_ACCOUNTS[from] && CASH_ACCOUNTS[to] && from !== to);
    const available = getCashAccountBalance(from);
    const sufficient = amount <= available + 0.000001;
    const valid = validAmount && validAccounts && sufficient;

    if (submit) submit.disabled = !valid || cashTransferSaving;
    if (!preview || !summary) return;

    if (!validAmount && !validAccounts) {
        preview.classList.add('hidden');
        return;
    }

    preview.classList.remove('hidden');
    if (!validAccounts) {
        summary.textContent = 'اختر صندوقين مختلفين لإتمام التحويل.';
        summary.className = 'text-xs font-bold text-amber-400';
        return;
    }
    if (!validAmount) {
        summary.textContent = 'أدخل مبلغًا أكبر من صفر.';
        summary.className = 'text-xs font-bold text-amber-400';
        return;
    }

    if (!sufficient) {
        summary.textContent = `الرصيد المتاح في ${getCashAccountLabel(from)} هو ${fmtNum(available)} ج.م فقط.`;
        summary.className = 'text-xs font-bold text-rose-400';
        return;
    }

    summary.textContent = `تحويل ${fmtNum(amount)} ج.م من ${getCashAccountLabel(from)} إلى ${getCashAccountLabel(to)}. الرصيد بعد التحويل: ${fmtNum(available - amount)} ج.م.`;
    summary.className = 'text-xs font-bold text-emerald-400';
}

async function submitCashTransfer(event) {
    if (!requireManager() || cashTransferSaving || !activeBuildingId) return;
    event.preventDefault();

    const transferBuildingId = activeBuildingId;
    if (cashTransferPendingBuildingId && cashTransferPendingBuildingId !== transferBuildingId) {
        clearCashTransferPendingMemory(cashTransferPendingBuildingId);
    }
    if (!cashTransferPendingRequestId) {
        try {
            const saved = JSON.parse(sessionStorage.getItem(cashTransferPendingStorageKey(transferBuildingId)) || 'null');
            const payload = saved?.payload;
            if (typeof saved?.requestId === 'string' && saved.requestId.trim() &&
                payload && typeof payload === 'object' &&
                CASH_ACCOUNTS[payload.fromAccountCode] && CASH_ACCOUNTS[payload.toAccountCode] &&
                payload.fromAccountCode !== payload.toAccountCode &&
                typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0 &&
                typeof payload.notes === 'string' && payload.notes.length <= 500) {
                cashTransferPendingRequestId = saved.requestId;
                cashTransferPendingPayload = payload;
                cashTransferPendingBuildingId = transferBuildingId;
            } else if (saved) {
                sessionStorage.removeItem(cashTransferPendingStorageKey(transferBuildingId));
            }
        } catch { /* Fall back to the in-memory retry key if storage is unavailable. */ }
    }
    const fromAccountCode = /** @type {HTMLSelectElement} */ (document.getElementById('cashTransferFrom'))?.value || '';
    const toAccountCode = /** @type {HTMLSelectElement} */ (document.getElementById('cashTransferTo'))?.value || '';
    const amount = Number(/** @type {HTMLInputElement} */ (document.getElementById('cashTransferAmount'))?.value);
    const notes = /** @type {HTMLTextAreaElement} */ (document.getElementById('cashTransferNotes'))?.value.trim() || '';
    const available = getCashAccountBalance(fromAccountCode);

    const requestPayload = { fromAccountCode, toAccountCode, amount, notes };
    if (cashTransferPendingRequestId && JSON.stringify(requestPayload) !== JSON.stringify(cashTransferPendingPayload)) {
        const fromInput = /** @type {HTMLSelectElement} */ (document.getElementById('cashTransferFrom'));
        const toInput = /** @type {HTMLSelectElement} */ (document.getElementById('cashTransferTo'));
        const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('cashTransferAmount'));
        const notesInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('cashTransferNotes'));
        if (fromInput) fromInput.value = cashTransferPendingPayload.fromAccountCode;
        if (toInput) toInput.value = cashTransferPendingPayload.toAccountCode;
        if (amountInput) amountInput.value = String(cashTransferPendingPayload.amount);
        if (notesInput) notesInput.value = cashTransferPendingPayload.notes;
        previewCashTransfer();
        toast('تمت استعادة بيانات تحويل سابق غير مؤكد. راجعها ثم اضغط التنفيذ مرة أخرى للتحقق دون تكرار.', 'error');
        return;
    }
    if (!CASH_ACCOUNTS[fromAccountCode] || !CASH_ACCOUNTS[toAccountCode] ||
        fromAccountCode === toAccountCode || !Number.isFinite(amount) || amount <= 0 ||
        notes.length > 500) {
        toast('راجع الصندوقين والمبلغ والملاحظات قبل التحويل.', 'error');
        return;
    }
    if (!cashTransferPendingRequestId && amount > available + 0.000001) {
        toast(`الرصيد المتاح في ${getCashAccountLabel(fromAccountCode)} غير كافٍ.`, 'error');
        return;
    }

    cashTransferSaving = true;
    if (!cashTransferPendingRequestId) {
        cashTransferPendingRequestId = generateId();
        cashTransferPendingPayload = requestPayload;
        cashTransferPendingBuildingId = transferBuildingId;
        try {
            sessionStorage.setItem(cashTransferPendingStorageKey(transferBuildingId), JSON.stringify({
                requestId: cashTransferPendingRequestId,
                payload: requestPayload
            }));
        } catch { /* The in-memory retry key remains available if storage is unavailable. */ }
    }
    const submit = /** @type {HTMLButtonElement} */ (document.getElementById('cashTransferSubmitButton'));
    if (submit) {
        submit.disabled = true;
        submit.textContent = 'جارٍ تنفيذ التحويل...';
    }

    try {
        const { data, error } = await supabaseClient.rpc('transfer_cash_between_accounts', {
            p_building_id: transferBuildingId,
            p_request_id: cashTransferPendingRequestId,
            p_expected_version: activeBuildingVersion,
            p_from_account_code: fromAccountCode,
            p_to_account_code: toAccountCode,
            p_amount: amount,
            p_notes: notes
        });
        if (activeBuildingId !== transferBuildingId) {
            clearCashTransferPendingMemory(transferBuildingId);
            return;
        }
        if (error) throw error;

        if (data?.conflict) {
            clearCashTransferPending(transferBuildingId);
            if (!await loadState()) throw new Error('Could not reload after a cashbox version conflict');
            renderAll();
            toast('تغيرت البيانات في جلسة أخرى. تم تحديث الأرصدة؛ راجع المعاينة ثم أعد التحويل.', 'error');
            return;
        }
        if (data?.insufficient_balance) {
            const availableBalance = (typeof data.available_balance === 'number' ||
                (typeof data.available_balance === 'string' && data.available_balance.trim() !== ''))
                ? Number(data.available_balance)
                : NaN;
            const responseVersion = parseCashboxVersion(data.version);
            if (!Number.isFinite(availableBalance) || responseVersion === null) {
                throw new Error('Invalid insufficient-balance response');
            }
            if (!await refreshCashboxSummary()) {
                throw new Error('Could not refresh cashbox summary after insufficient balance');
            }
            if (activeBuildingId !== transferBuildingId) return;
            activeBuildingVersion = responseVersion;
            clearCashTransferPending(transferBuildingId);
            renderAll();
            toast(`الرصيد الفعلي المتاح هو ${fmtNum(availableBalance)} ج.م. تم إلغاء التحويل وتحديث أرصدة الصناديق.`, 'error');
            return;
        }
        const responseVersion = parseCashboxVersion(data?.version);
        if (!data?.ok || responseVersion === null ||
            (!data.duplicate && (!hasValidCashboxBalances(data.balances) ||
                typeof data.transfer_id !== 'string' || !data.transfer_id.trim() ||
                typeof data.audit_log_id !== 'string' || !data.audit_log_id.trim()))) {
            throw new Error('Invalid cash transfer response');
        }

        if (data.duplicate) {
            if (!await loadState()) throw new Error('Could not reload after an idempotent cash transfer retry');
            clearCashTransferPending(transferBuildingId);
            /** @type {HTMLFormElement} */ (document.getElementById('cashTransferForm'))?.reset();
            document.getElementById('cashTransferPreview')?.classList.add('hidden');
            renderAll();
            toast('التحويل كان قد نُفذ مسبقًا. تم تحديث البيانات دون تكراره.', 'success');
            return;
        }

        activeBuildingVersion = responseVersion;
        if (data.balances) state.cashAccountBalances = data.balances;
        if (data.audit_log_id) {
            const details = `${getCashAccountLabel(fromAccountCode)} ← ${getCashAccountLabel(toAccountCode)} · ${fmtNum(amount)} ج.م`;
            state.auditLogs.unshift({
                id: data.audit_log_id,
                action: 'تحويل بين الصناديق',
                details,
                date: new Date().toISOString()
            });
            persistedAuditLogIds.add(data.audit_log_id);
        }

        let summaryRefreshed = false;
        try {
            summaryRefreshed = await refreshCashboxSummary();
        } catch (refreshError) {
            console.warn('Cashbox summary refresh failed after a confirmed transfer:', refreshError);
        }
        if (activeBuildingId !== transferBuildingId) {
            clearCashTransferPending(transferBuildingId);
            return;
        }
        if (!summaryRefreshed) {
            const existingTransfers = Array.isArray(state.cashTransfers) ? state.cashTransfers : [];
            state.cashTransfers = [{
                id: data.transfer_id,
                fromAccountCode,
                toAccountCode,
                amount,
                notes,
                transferredAt: new Date().toISOString()
            }, ...existingTransfers.filter(transfer => transfer.id !== data.transfer_id)];
        }

        clearCashTransferPending(transferBuildingId);
        /** @type {HTMLFormElement} */ (document.getElementById('cashTransferForm'))?.reset();
        document.getElementById('cashTransferPreview')?.classList.add('hidden');
        renderAll();
        toast('تم التحويل بين الصناديق بنجاح.', 'success');
    } catch (error) {
        if (activeBuildingId !== transferBuildingId) {
            clearCashTransferPendingMemory(transferBuildingId);
            return;
        }
        console.error('Cash transfer failed:', error);
        toast('تعذر تأكيد التحويل. أعد المحاولة دون تغيير البيانات للتحقق من نفس الطلب.', 'error');
    } finally {
        cashTransferSaving = false;
        if (submit) {
            submit.textContent = 'تنفيذ التحويل';
            previewCashTransfer();
        }
    }
}

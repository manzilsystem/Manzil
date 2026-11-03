const CASH_ACCOUNTS = Object.freeze({
    main: { label: 'الخزنة الرئيسية', shortLabel: 'الرئيسية' },
    development: { label: 'صندوق التطوير', shortLabel: 'التطوير' },
    emergency: { label: 'صندوق الصيانة الطارئة', shortLabel: 'الطوارئ' }
});

let cashTransferSaving = false;
let cashTransferPendingRequestId = null;
let cashTransferPendingPayload = null;
let persistedCashTotals = null;

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
    const totals = {
        startingBalance: cents(state.startingBalance),
        income: state.income.reduce((sum, row) => sum + cents(row.amount), 0),
        expenses: { main: 0, development: 0, emergency: 0 }
    };
    state.expenses.forEach(expense => {
        const code = CASH_ACCOUNTS[expense.cashAccountCode] ? expense.cashAccountCode : 'main';
        totals.expenses[code] += cents(expense.amount);
    });
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
    balances.main = (Math.round((Number(balances.main) || 0) * 100)
        + next.startingBalance - previous.startingBalance
        + next.income - previous.income
        - next.expenses.main + previous.expenses.main) / 100;
    balances.development = (Math.round((Number(balances.development) || 0) * 100)
        - next.expenses.development + previous.expenses.development) / 100;
    balances.emergency = (Math.round((Number(balances.emergency) || 0) * 100)
        - next.expenses.emergency + previous.expenses.emergency) / 100;
    state.cashAccountBalances = balances;
    persistedCashTotals = next;
    return true;
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
    const submit = document.getElementById('cashTransferSubmitButton');
    const from = document.getElementById('cashTransferFrom')?.value || '';
    const to = document.getElementById('cashTransferTo')?.value || '';
    const amount = Number(document.getElementById('cashTransferAmount')?.value);
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
    const fromAccountCode = document.getElementById('cashTransferFrom')?.value || '';
    const toAccountCode = document.getElementById('cashTransferTo')?.value || '';
    const amount = Number(document.getElementById('cashTransferAmount')?.value);
    const notes = document.getElementById('cashTransferNotes')?.value.trim() || '';
    const available = getCashAccountBalance(fromAccountCode);

    if (!CASH_ACCOUNTS[fromAccountCode] || !CASH_ACCOUNTS[toAccountCode] ||
        fromAccountCode === toAccountCode || !Number.isFinite(amount) || amount <= 0 ||
        notes.length > 500) {
        toast('راجع الصندوقين والمبلغ والملاحظات قبل التحويل.', 'error');
        return;
    }
    if (amount > available + 0.000001) {
        toast(`الرصيد المتاح في ${getCashAccountLabel(fromAccountCode)} غير كافٍ.`, 'error');
        return;
    }

    const requestPayload = { fromAccountCode, toAccountCode, amount, notes };
    if (cashTransferPendingRequestId && JSON.stringify(requestPayload) !== JSON.stringify(cashTransferPendingPayload)) {
        toast('يوجد تحويل سابق لم يتأكد وصول نتيجته. أعد المحاولة بنفس البيانات أولًا.', 'error');
        return;
    }

    cashTransferSaving = true;
    if (!cashTransferPendingRequestId) {
        cashTransferPendingRequestId = generateId();
        cashTransferPendingPayload = requestPayload;
    }
    const submit = document.getElementById('cashTransferSubmitButton');
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
            cashTransferPendingRequestId = null;
            cashTransferPendingPayload = null;
            return;
        }
        if (error) throw error;

        if (data?.conflict) {
            cashTransferPendingRequestId = null;
            cashTransferPendingPayload = null;
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
            activeBuildingVersion = responseVersion;
            cashTransferPendingRequestId = null;
            cashTransferPendingPayload = null;
            state.cashAccountBalances = {
                ...(state.cashAccountBalances || {}),
                [fromAccountCode]: availableBalance
            };
            renderCashbox();
            toast(`الرصيد الفعلي المتاح هو ${fmtNum(availableBalance)} ج.م. تم إلغاء التحويل.`, 'error');
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
            cashTransferPendingRequestId = null;
            cashTransferPendingPayload = null;
            document.getElementById('cashTransferForm')?.reset();
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
            cashTransferPendingRequestId = null;
            cashTransferPendingPayload = null;
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

        cashTransferPendingRequestId = null;
        cashTransferPendingPayload = null;
        document.getElementById('cashTransferForm')?.reset();
        document.getElementById('cashTransferPreview')?.classList.add('hidden');
        renderAll();
        toast('تم التحويل بين الصناديق بنجاح.', 'success');
    } catch (error) {
        if (activeBuildingId !== transferBuildingId) {
            cashTransferPendingRequestId = null;
            cashTransferPendingPayload = null;
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

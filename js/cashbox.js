const CASH_ACCOUNTS = Object.freeze({
    main: { label: 'الخزنة الرئيسية', shortLabel: 'الرئيسية' },
    development: { label: 'صندوق التطوير', shortLabel: 'التطوير' },
    emergency: { label: 'صندوق الصيانة الطارئة', shortLabel: 'الطوارئ' }
});

let cashTransferSaving = false;
let cashTransferPendingRequestId = null;

function getCashAccountLabel(code) {
    return CASH_ACCOUNTS[code]?.label || CASH_ACCOUNTS.main.label;
}

function getCashAccountBalance(code) {
    const value = Number(state.cashAccountBalances?.[code]);
    return Number.isFinite(value) ? value : 0;
}

function renderCashbox() {
    if (currentUserRole !== 'manager') return;

    for (const code of Object.keys(CASH_ACCOUNTS)) {
        const element = document.getElementById(`cashBalance-${code}`);
        if (element) element.textContent = `${fmtNum(getCashAccountBalance(code))} ج.م`;
    }

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
    const sufficient = from === 'main' || amount <= available + 0.000001;
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
    if (!requireManager() || cashTransferSaving) return;
    event.preventDefault();

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
    if (fromAccountCode !== 'main' && amount > available + 0.000001) {
        toast(`الرصيد المتاح في ${getCashAccountLabel(fromAccountCode)} غير كافٍ.`, 'error');
        return;
    }

    cashTransferSaving = true;
    if (!cashTransferPendingRequestId) cashTransferPendingRequestId = generateId();
    const submit = document.getElementById('cashTransferSubmitButton');
    if (submit) {
        submit.disabled = true;
        submit.textContent = 'جارٍ تنفيذ التحويل...';
    }

    try {
        const { data, error } = await supabaseClient.rpc('transfer_cash_between_accounts', {
            p_building_id: activeBuildingId,
            p_request_id: cashTransferPendingRequestId,
            p_from_account_code: fromAccountCode,
            p_to_account_code: toAccountCode,
            p_amount: amount,
            p_notes: notes
        });
        if (error) throw error;

        if (data?.insufficient_balance) {
            state.cashAccountBalances = {
                ...(state.cashAccountBalances || {}),
                [fromAccountCode]: Number(data.available_balance) || 0
            };
            renderCashbox();
            toast(`الرصيد الفعلي المتاح هو ${fmtNum(data.available_balance)} ج.م. تم إلغاء التحويل.`, 'error');
            return;
        }
        if (!data?.ok || !Number.isInteger(Number(data.version))) {
            throw new Error('Invalid cash transfer response');
        }

        activeBuildingVersion = Number(data.version);
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

        try {
            await refreshCashboxSummary();
        } catch (refreshError) {
            console.warn('Cashbox summary refresh failed after a confirmed transfer:', refreshError);
        }

        cashTransferPendingRequestId = null;
        document.getElementById('cashTransferForm')?.reset();
        document.getElementById('cashTransferPreview')?.classList.add('hidden');
        renderAll();
        toast('تم التحويل بين الصناديق بنجاح.', 'success');
    } catch (error) {
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

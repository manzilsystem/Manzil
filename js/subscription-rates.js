// @ts-check
function mapSubscriptionRateChange(row) {
    return {
        effectiveMonth: String(row.effective_month).slice(0, 10),
        previousMonthlyAmount: row.previous_monthly_amount == null ? null : Number(row.previous_monthly_amount),
        newMonthlyAmount: Number(row.new_monthly_amount) || 0,
        changeType: row.change_type,
        changedAt: row.changed_at,
        changedBy: row.changed_by || null
    };
}

async function reloadResidentSubscriptionRateHistory(residentId) {
    if (currentUserRole !== 'manager' || !activeBuildingId) return [];
    const { data, error } = await supabaseClient
        .from('resident_subscription_rate_changes')
        .select('effective_month,previous_monthly_amount,new_monthly_amount,change_type,changed_at,changed_by')
        .eq('building_id', activeBuildingId)
        .eq('resident_id', residentId)
        .order('changed_at', { ascending: false });
    if (error) throw error;
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) return [];
    resident.subscriptionRateHistory = (data || []).map(mapSubscriptionRateChange);
    return resident.subscriptionRateHistory;
}

(function installSubscriptionRatePersistence() {
    const originalLoadState = loadState;
    loadState = async function loadStateWithSubscriptionRates() {
        const loaded = await originalLoadState();
        if (!loaded || !activeBuildingId || !Array.isArray(state.residents)) return loaded;
        const [ratesResult, historyResult] = await Promise.all([
            supabaseClient
                .from('resident_subscription_rates')
                .select('resident_id,effective_month,monthly_amount')
                .eq('building_id', activeBuildingId)
                .order('effective_month', { ascending: true }),
            currentUserRole === 'manager'
                ? supabaseClient
                    .from('resident_subscription_rate_changes')
                    .select('resident_id,effective_month,previous_monthly_amount,new_monthly_amount,change_type,changed_at,changed_by')
                    .eq('building_id', activeBuildingId)
                    .order('changed_at', { ascending: false })
                : Promise.resolve({ data: [], error: null })
        ]);
        if (ratesResult.error) throw ratesResult.error;
        if (historyResult.error) throw historyResult.error;
        const ratesByResident = new Map();
        (ratesResult.data || []).forEach(rate => {
            const rates = ratesByResident.get(rate.resident_id) || [];
            rates.push({
                effectiveMonth: String(rate.effective_month).slice(0, 10),
                monthlyAmount: Number(rate.monthly_amount) || 0
            });
            ratesByResident.set(rate.resident_id, rates);
        });
        const historyByResident = new Map();
        (historyResult.data || []).forEach(row => {
            const history = historyByResident.get(row.resident_id) || [];
            history.push(mapSubscriptionRateChange(row));
            historyByResident.set(row.resident_id, history);
        });
        state.residents.forEach(resident => {
            resident.subscriptionRates = ratesByResident.get(resident.id) || [];
            resident.subscriptionRateHistory = historyByResident.get(resident.id) || [];
        });
        return loaded;
    };
})();

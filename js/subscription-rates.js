(function installSubscriptionRatePersistence() {
    const originalLoadState = loadState;
    loadState = async function loadStateWithSubscriptionRates() {
        const loaded = await originalLoadState();
        if (!loaded || !activeBuildingId || !Array.isArray(state.residents)) return loaded;
        const { data, error } = await supabaseClient
            .from('resident_subscription_rates')
            .select('resident_id,effective_month,monthly_amount')
            .eq('building_id', activeBuildingId)
            .order('effective_month', { ascending: true });
        if (error) throw error;
        const byResident = new Map();
        (data || []).forEach(rate => {
            const rates = byResident.get(rate.resident_id) || [];
            rates.push({
                effectiveMonth: String(rate.effective_month).slice(0, 10),
                monthlyAmount: Number(rate.monthly_amount) || 0
            });
            byResident.set(rate.resident_id, rates);
        });
        state.residents.forEach(resident => {
            resident.subscriptionRates = byResident.get(resident.id) || [];
        });
        return loaded;
    };

    const originalSaveState = saveState;
    saveState = async function saveStateWithSubscriptionRates() {
        const saved = await originalSaveState();
        if (!saved) return false;
        const rates = state.residents.flatMap(resident =>
            (Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : [])
                .map(rate => ({ residentId: resident.id, ...rate }))
        );
        for (const rate of rates) {
            const { error } = await supabaseClient.rpc('set_resident_subscription_rate', {
                p_building_id: activeBuildingId,
                p_resident_id: rate.residentId,
                p_effective_month: rate.effectiveMonth,
                p_monthly_amount: rate.monthlyAmount
            });
            if (error) {
                console.error('Subscription rate persistence failed:', error);
                toast('تم حفظ بيانات المبنى، لكن تعذر حفظ تاريخ الاشتراك. أعد الحفظ بعد التحقق من الاتصال.', 'error');
                return true;
            }
        }
        return true;
    };
})();

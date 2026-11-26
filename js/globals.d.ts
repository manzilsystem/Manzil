// Ambient declarations for browser globals the app attaches at runtime.
// Extended gradually as more modules move under TypeScript checking.

interface ManzilSupabaseConfig {
    url?: string;
    key?: string;
    anonKey?: string;
}

interface ManzilAssistantChatStore {
    isAvailable?: () => boolean;
    load?: () => Promise<{ messages?: Array<{ sender_type?: string; body?: string; created_at?: string }>; context?: Record<string, unknown> } | null>;
    append?: (senderType: 'user' | 'assistant', body: string, metadata?: Record<string, unknown>) => Promise<boolean>;
    clear?: () => Promise<boolean>;
}

interface Window {
    currentUserRole?: string;
    supabase?: any;
    manzilSupabaseConfig?: ManzilSupabaseConfig;
    manzilAssistantChatStore?: ManzilAssistantChatStore;
    manzilReportError?: (message: unknown) => void;
    manzilErrorLog?: () => unknown[];
    __manzilPeriodReportRequestToken?: number;
    MANZIL_RELEASE?: string;
    MANZIL_EXTENDED_REPORTS?: Record<string, unknown>;
    MANZIL_INSIGHTS_REPORTS?: Record<string, unknown>;
    MANZIL_COLLECTION_CURVE_REPORT?: Record<string, unknown>;
    MANZIL_ANNUAL_SUMMARY_REPORT?: Record<string, unknown>;
    MANZIL_CASH_FORECAST_REPORT?: Record<string, unknown>;
    html2pdf?: () => { set: (options: Record<string, unknown>) => { from: (element: HTMLElement) => any } };
}

// Global functions defined in other JS modules
declare function normalizeOwnerPhone(input: unknown): string | null;

// App state and utilities
declare var state: any;
declare var currentUserRole: string;
declare var assistantGroqTranscribe: ((audio: Blob) => Promise<string>) | undefined;

// Reports - chart colors and high-level renderers (js/reports/shared/charts.js)
declare const REPORT_CHART_COLORS: { emerald: string; rose: string; amber: string; sky: string; indigo: string; slate: string };
declare function renderDoughnutValues(canvasId: string, labels: string[], values: number[], palette: string[], options?: Record<string, unknown>): any;
declare function renderBarValues(canvasId: string, labels: string[], values: number[], color: string, label?: string, options?: Record<string, unknown>): any;
declare function renderLineSeries(canvasId: string, labels: string[], series: Array<{ label: string; values: number[]; color: string; fill?: string }>, options?: Record<string, unknown>): any;
declare function reportChartPalette(count: number): string[];
declare function hasReportChartData(values: unknown[]): boolean;
declare function destroyChartById(canvasId: string): void;
declare function createChartContainer(containerId: string, canvasId: string, height?: number): HTMLElement | null;
declare function destroyChartsInContainer(containerId: string): void;

// Reports - period comparison (js/reports/shared/comparison.js)
declare function getComparisonRange(fromMonth: string, toMonth: string, mode: string, customFrom?: string, customTo?: string): { fromMonth: string; toMonth: string; label: string } | null;
declare function buildComparisonModel(currentReport: any, previousReport: any, metricsOverride?: any[]): any;
declare function buildReportComparisonHtml(currentReport: any, previousReport: any, metrics?: any[]): string;
declare function renderComparisonHtml(comparison: any): string;

// Reports - Excel export (js/reports/shared/excel-exporter.js)
declare function exportReportExcel(filename: string, sheets: Array<{ name: string; rows: any[][]; options?: Record<string, unknown> }>): boolean;
declare function exportReportWithDetailExcel(filename: string, title: string, summaryRows: any[][], detailRows: any[][], meta?: Record<string, unknown>): boolean;
declare function periodReportToExcelRows(report: any): { summary: any[][]; details: any[][] };
declare function expensesReportToExcelRows(report: any): { summary: any[][]; details: any[][] };
declare function adjustmentsReportToExcelRows(report: any): { summary: any[][]; details: any[][] };
declare function arrearsReportToExcelRows(report: any): { summary: any[][]; details: any[][] };

// Reports - performance (js/reports/shared/performance.js)
declare function ensureChartJs(): Promise<boolean>;
declare function clearReportModelCache(): void;
declare function getCachedReportModel(cacheKey: string, builder: Function, invalidateChecker?: Function): any;

// Reports - saved templates (js/reports/shared/templates.js)
declare function initReportTemplatesUI(): void;
declare function saveReportTemplateFromPanel(tab: string): any;
declare function applyTemplate(templateId: string): boolean;
declare function deleteTemplate(templateId: string): boolean;
declare function loadReportTemplates(): any[];
declare function getTemplatesForReport(reportType: string): any[];
declare function renderTemplateList(reportType: string, containerId: string): void;
declare function addReportTemplate(name: string, reportType: string, filters: Record<string, unknown>): any;
declare function applyReportTemplate(templateId: string): Record<string, unknown> | null;
declare function deleteReportTemplate(templateId: string): boolean;

// Report flow helpers called from inline handlers and sibling modules
declare function renderReportFilterSummaries(): void;
declare function clearReportFilters(tab: string): boolean;
declare function invalidateMonthlyClosePreview(): void;
declare function renderAuditLog(options?: { more?: boolean }): void;
declare function resetArrearsFilters(): void;
declare function applyCashFlowPreset(): void;
declare function applyApartmentsPreset(): void;
declare function invalidateCashFlowPreview(): void;
declare function invalidateApartmentsPreview(): void;

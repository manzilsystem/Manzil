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
    html2pdf?: () => { set: (options: Record<string, unknown>) => { from: (element: HTMLElement) => { outputPdf: (type: string) => Promise<Blob> } } };
}

// Global functions defined in other JS modules
declare function normalizeOwnerPhone(input: unknown): string | null;

// App state and utilities
declare var state: any;
declare var currentUserRole: string;

// Reports - chart colors and high-level renderers (js/reports/shared/charts.js)
declare const REPORT_CHART_COLORS: { emerald: string; rose: string; amber: string; sky: string; indigo: string; slate: string };
declare function renderDoughnutValues(canvasId: string, labels: string[], values: number[], palette: string[], options?: Record<string, unknown>): any;
declare function renderBarValues(canvasId: string, labels: string[], values: number[], color: string, label?: string, options?: Record<string, unknown>): any;
declare function renderLineSeries(canvasId: string, labels: string[], series: Array<{ label: string; values: number[]; color: string; fill?: string }>, options?: Record<string, unknown>): any;
declare function createChartContainer(containerId: string, canvasId: string, height?: number): HTMLElement | null;
declare function destroyChartsInContainer(containerId: string): void;

// Reports - period comparison (js/reports/shared/comparison.js)
declare function getComparisonRange(fromMonth: string, toMonth: string, mode: string, customFrom?: string, customTo?: string): { fromMonth: string; toMonth: string; label: string } | null;
declare function buildComparisonModel(currentReport: any, previousReport: any): any;
declare function renderComparisonHtml(comparison: any): string;

// Reports - Excel export (js/reports/shared/excel-exporter.js)
declare function exportReportExcel(filename: string, sheets: Array<{ name: string; rows: any[][]; options?: Record<string, unknown> }>): boolean;
declare function exportReportWithDetailExcel(filename: string, title: string, summaryRows: any[][], detailRows: any[][], meta?: Record<string, unknown>): boolean;
declare function periodReportToExcelRows(report: any): { summary: any[][]; details: any[][] };
declare function expensesReportToExcelRows(report: any): { summary: any[][]; details: any[][] };

// Reports - scheduled reports (js/reports/shared/scheduled-reports.js)
declare function initScheduledReportsUI(): void;
declare function addScheduledReport(config: Record<string, unknown>): any;
declare function renderScheduledReportsList(containerId: string): void;
declare function renderScheduleLog(containerId: string): void;

// Reports - performance (js/reports/shared/performance.js)
declare function memoize(fn: Function, maxSize?: number): any;
declare function ensureChartJs(): Promise<boolean>;
declare function isChartJsReady(): boolean;
declare function clearAllReportCaches(): void;
declare function clearReportModelCache(): void;
declare function getCachedReportModel(cacheKey: string, builder: Function, invalidateChecker?: Function): any;

// Reports - saved templates (js/reports/shared/templates.js)
declare function renderTemplateList(reportType: string, containerId: string): void;
declare function addReportTemplate(name: string, reportType: string, filters: Record<string, unknown>): any;
declare function applyReportTemplate(templateId: string): Record<string, unknown> | null;
declare function deleteReportTemplate(templateId: string): boolean;

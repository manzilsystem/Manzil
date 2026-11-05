// Ambient declarations for browser globals the app attaches at runtime.
// Extended gradually as more modules move under TypeScript checking.

interface ManzilSupabaseConfig {
    url?: string;
    key?: string;
    anonKey?: string;
}

interface Window {
    currentUserRole?: string;
    manzilSupabaseConfig?: ManzilSupabaseConfig;
    manzilReportError?: (message: unknown) => void;
    manzilErrorLog?: () => unknown[];
    html2pdf?: () => { set: (options: Record<string, unknown>) => { from: (element: HTMLElement) => { outputPdf: (type: string) => Promise<Blob> } } };
}

// Global functions defined in other JS modules
declare var activeBuildingId: string | undefined;
declare var saveState: () => Promise<boolean>;
declare var renderAll: () => void;
declare var updateThemeSelection: () => void;
declare var activeSession: { user: { id: string } } | null;
declare var supabaseClient: any | null;
declare var updateAccessSwitchButton: () => void;
declare var initSupabaseApp: () => Promise<void>;
declare var renderNotices: () => void;
declare var loadState: () => Promise<boolean>;
declare var activeBuildingVersion: number;
declare var refreshCashboxSummary: () => Promise<boolean>;
declare var persistedAuditLogIds: Set<string>;
declare var lockCurrentSession: () => void;
declare var setAuthModal: (locked: boolean, message?: string) => void;
declare var getArrearsReportFilters: () => { apartmentNumber?: string; fromMonth?: string; toMonth?: string; status?: string };

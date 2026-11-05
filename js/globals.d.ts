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
    html2pdf?: unknown;
}

// Global functions defined in other JS modules
declare var activeBuildingId: string | undefined;
declare var saveState: () => Promise<boolean>;
declare var renderAll: () => void;
declare var updateThemeSelection: () => void;
declare var activeSession: { user: { id: string } } | null;
declare var supabaseClient: any | null;
declare var updateAccessSwitchButton: () => void;

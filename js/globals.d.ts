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

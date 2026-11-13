// Ambient declarations for browser globals the app attaches at runtime.
// Extended gradually as more modules move under TypeScript checking.

interface ManzilSupabaseConfig {
    url?: string;
    key?: string;
    anonKey?: string;
}

interface AssistantAvatar3DController {
    mount: () => void;
    unmount: () => void;
    toggle: () => void;
    state: () => 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
    isReady: () => boolean;
    isShowing: () => boolean;
}

interface Window {
    AssistantAvatar3D?: AssistantAvatar3DController;
    currentUserRole?: string;
    supabase?: any;
    manzilSupabaseConfig?: ManzilSupabaseConfig;
    manzilReportError?: (message: unknown) => void;
    manzilErrorLog?: () => unknown[];
    MANZIL_RELEASE?: string;
    html2pdf?: () => { set: (options: Record<string, unknown>) => { from: (element: HTMLElement) => { outputPdf: (type: string) => Promise<Blob> } } };
}

// Global functions defined in other JS modules
declare function normalizeOwnerPhone(input: unknown): string | null;

// App state and utilities
declare var state: any;
declare var currentUserRole: string;

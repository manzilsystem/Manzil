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
    html2pdf?: () => { set: (options: Record<string, unknown>) => { from: (element: HTMLElement) => { outputPdf: (type: string) => Promise<Blob> } } };
}

// Global functions defined in other JS modules
declare function normalizeOwnerPhone(input: unknown): string | null;

// App state and utilities
declare var state: any;
declare var currentUserRole: string;

export type UpdateStatusKind =
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
    | 'disabled';

export interface UpdateStatus {
    kind: UpdateStatusKind;
    version?: string;
    percent?: number;
    notes?: string;
    error?: string;
}

export interface UpdateInfo {
    version: string;
    notes: string;
}

export const RELEASE_HIGHLIGHTS: Record<string, string[]> = {
    '1.0.0': [
        'Real-time connection monitoring across macOS, Windows, and Linux',
        'Local AI analysis with OpenAI, Anthropic, and Ollama providers',
        'Consumer visibility: WiFi devices, DNS, VPN-leak detection, geo map, IoT',
        'Active defense: manual kill and block, bandwidth, webhooks, SSL monitoring',
        'Signed installers with automatic updates',
    ],
};

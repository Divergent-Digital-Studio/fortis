export type WhitelistSource = 'user' | 'system' | 'learning';

export interface WhitelistEntry {
    id: string;
    processName?: string;
    remoteAddress?: string;
    remotePort?: number;
    reason: string;
    createdAt: number;
    source: WhitelistSource;
}

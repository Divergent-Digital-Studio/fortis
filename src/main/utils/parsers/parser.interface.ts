import type { NetworkConnection } from '@shared/types';
import type { SupportedPlatform } from '../platform';

export interface ParseMeta {
    parser: string;
    source: 'primary' | 'fallback' | 'worker';
}

export interface IConnectionParser {
    parse(): Promise<NetworkConnection[]>;
    getPlatform(): SupportedPlatform;
    getLastParseMeta?(): ParseMeta | null;
}

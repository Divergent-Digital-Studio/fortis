import type { NetworkConnection } from '@shared/types';
import type { SupportedPlatform } from '../platform';
import { getPlatform } from '../platform';
import type { IConnectionParser, ParseMeta } from './parser.interface';
import { parseInWorker } from './parser-worker';

export class WorkerOffloadParser implements IConnectionParser {
    private lastMeta: ParseMeta | null = null;

    async parse(): Promise<NetworkConnection[]> {
        const result = await parseInWorker();

        if (!result.success) {
            this.lastMeta = null;
            throw new WorkerParseError(result.error ?? 'Worker parse failed');
        }

        this.lastMeta = {
            parser: result.parser ?? 'unknown',
            source: result.source ?? 'primary',
        };

        return result.connections;
    }

    getPlatform(): SupportedPlatform {
        return getPlatform();
    }

    getLastParseMeta(): ParseMeta | null {
        return this.lastMeta;
    }
}

export class WorkerParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkerParseError';
    }
}

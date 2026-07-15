import type { NetworkConnection } from '@shared/types';
import type { IConnectionParser } from './parser.interface';
import type { SupportedPlatform } from '../platform';
import { getPlatform, UnsupportedPlatformError } from '../platform';
import { MacParser } from './mac-parser';
import { WindowsParser } from './win-parser';
import { LinuxParser } from './linux-parser';
import { SystemInfoFallbackAdapter } from './systeminformation-adapter';

type ParserSource = 'primary' | 'fallback';

interface ParseResult {
    connections: NetworkConnection[];
    parser: string;
    source: ParserSource;
    durationMs: number;
}

const PARSER_NAMES: Record<SupportedPlatform, string> = {
    darwin: 'lsof',
    win32: 'netstat',
    linux: 'ss',
};

export class PlatformParserFactory {
    static getParser(platform?: SupportedPlatform): IConnectionParser {
        const resolvedPlatform = platform ?? getPlatform();

        switch (resolvedPlatform) {
            case 'darwin':
                return new MacParser();
            case 'win32':
                return new WindowsParser();
            case 'linux':
                return new LinuxParser();
            default: {
                const exhaustive: never = resolvedPlatform;
                throw new UnsupportedPlatformError(String(exhaustive));
            }
        }
    }

    static getParserName(platform?: SupportedPlatform): string {
        const resolvedPlatform = platform ?? getPlatform();
        return PARSER_NAMES[resolvedPlatform] ?? 'unknown';
    }

    static async parseWithFallback(platform?: SupportedPlatform): Promise<ParseResult> {
        const resolvedPlatform = platform ?? getPlatform();
        const primaryParser = PlatformParserFactory.getParser(resolvedPlatform);
        const parserName = PlatformParserFactory.getParserName(resolvedPlatform);

        const primaryStart = Date.now();

        try {
            const connections = await primaryParser.parse();
            const durationMs = Date.now() - primaryStart;

            console.log(`[ParserFactory] Primary parser (${parserName}) succeeded: ${connections.length} connections in ${durationMs}ms`);

            return {
                connections,
                parser: parserName,
                source: 'primary',
                durationMs,
            };
        } catch (primaryError) {
            const primaryDuration = Date.now() - primaryStart;
            const errorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);

            console.warn(`[ParserFactory] Primary parser (${parserName}) failed after ${primaryDuration}ms: ${errorMessage}`);
            console.log('[ParserFactory] Attempting systeminformation fallback...');

            const fallbackAdapter = new SystemInfoFallbackAdapter();
            const fallbackStart = Date.now();

            try {
                const connections = await fallbackAdapter.parse();
                const durationMs = Date.now() - fallbackStart;

                console.log(`[ParserFactory] Fallback parser (systeminformation) succeeded: ${connections.length} connections in ${durationMs}ms`);

                return {
                    connections,
                    parser: 'systeminformation',
                    source: 'fallback',
                    durationMs,
                };
            } catch (fallbackError) {
                const fallbackDuration = Date.now() - fallbackStart;
                const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

                console.error(`[ParserFactory] Fallback parser (systeminformation) also failed after ${fallbackDuration}ms: ${fallbackMessage}`);

                const combinedMessage = `Primary parser (${parserName}) failed: ${errorMessage}. Fallback (systeminformation) also failed: ${fallbackMessage}`;
                throw new ParserPipelineError(combinedMessage, resolvedPlatform, primaryError, fallbackError);
            }
        }
    }
}

export class ParserPipelineError extends Error {
    readonly platform: string;
    readonly primaryError: unknown;
    readonly fallbackError: unknown;

    constructor(
        message: string,
        platform: string,
        primaryError: unknown,
        fallbackError: unknown,
    ) {
        super(message);
        this.name = 'ParserPipelineError';
        this.platform = platform;
        this.primaryError = primaryError;
        this.fallbackError = fallbackError;
    }
}

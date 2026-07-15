import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { NetworkConnection } from '@shared/types';
import { PlatformParserFactory } from './parser-factory';

const WORKER_TIMEOUT_MS = 30_000;

interface WorkerResult {
    success: boolean;
    connections: NetworkConnection[];
    parser?: string;
    source?: 'primary' | 'fallback';
    error?: string;
    durationMs: number;
}

export function parseInWorker(): Promise<WorkerResult> {
    return new Promise((resolve, _reject) => {
        const currentFile = fileURLToPath(import.meta.url);
        const workerPath = path.resolve(path.dirname(currentFile), 'parser-worker-entry.js');

        let worker: Worker;

        try {
            worker = new Worker(workerPath);
        } catch {
            resolve(runParserInline());
            return;
        }

        const timer = setTimeout(() => {
            worker.terminate();
            resolve({
                success: false,
                connections: [],
                error: `Worker timed out after ${WORKER_TIMEOUT_MS}ms`,
                durationMs: WORKER_TIMEOUT_MS,
            });
        }, WORKER_TIMEOUT_MS);

        worker.on('message', (result: WorkerResult) => {
            clearTimeout(timer);
            resolve(result);
            worker.terminate();
        });

        worker.on('error', (error: Error) => {
            clearTimeout(timer);
            console.error('[ParserWorker] Worker error, falling back to inline:', error.message);
            worker.terminate();
            resolve(runParserInline());
        });

        worker.on('exit', (code: number) => {
            clearTimeout(timer);
            if (code !== 0) {
                console.warn(`[ParserWorker] Worker exited with code ${code}, falling back to inline`);
                resolve(runParserInline());
            }
        });

        worker.postMessage({ action: 'parse' });
    });
}

async function runParserInline(): Promise<WorkerResult> {
    const startTime = Date.now();

    try {
        const result = await PlatformParserFactory.parseWithFallback();

        return {
            success: true,
            connections: result.connections,
            parser: result.parser,
            source: result.source,
            durationMs: result.durationMs,
        };
    } catch (error) {
        return {
            success: false,
            connections: [],
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
        };
    }
}

if (!isMainThread && parentPort) {
    const port = parentPort;

    port.on('message', async (message: { action: string }) => {
        if (message.action !== 'parse') return;

        try {
            const result = await PlatformParserFactory.parseWithFallback();

            const workerResult: WorkerResult = {
                success: true,
                connections: result.connections,
                parser: result.parser,
                source: result.source,
                durationMs: result.durationMs,
            };

            port.postMessage(workerResult);
        } catch (error) {
            const workerResult: WorkerResult = {
                success: false,
                connections: [],
                error: error instanceof Error ? error.message : String(error),
                durationMs: 0,
            };

            port.postMessage(workerResult);
        }
    });
}

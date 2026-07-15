import { parentPort } from 'node:worker_threads';
import { PlatformParserFactory } from './parser-factory';

if (!parentPort) {
    process.exit(1);
}

const port = parentPort;

port.on('message', async (message: { action: string }) => {
    if (message.action !== 'parse') return;

    const startTime = Date.now();

    try {
        const result = await PlatformParserFactory.parseWithFallback();

        port.postMessage({
            success: true,
            connections: result.connections,
            parser: result.parser,
            source: result.source,
            durationMs: result.durationMs,
        });
    } catch (error) {
        port.postMessage({
            success: false,
            connections: [],
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
        });
    }
});

import { execFile } from 'node:child_process';
import type { SampleSource } from '../bandwidth-monitor';
import { parseNettop } from './nettop-parse';

const NETTOP_ARGS = ['-P', '-L', '1', '-x', '-J', 'bytes_in,bytes_out'];
const NETTOP_TIMEOUT_MS = 8000;

function runNettop(): Promise<string | null> {
    return new Promise((resolve) => {
        execFile('nettop', NETTOP_ARGS, { timeout: NETTOP_TIMEOUT_MS }, (err, stdout) => {
            if (err) {
                console.error('[Bandwidth] nettop failed:', err.message);
                resolve(null);
                return;
            }
            resolve(stdout);
        });
    });
}

export function createBandwidthSource(platform: NodeJS.Platform = process.platform): SampleSource {
    if (platform !== 'darwin') {
        return { supported: false, sample: () => Promise.resolve(null) };
    }
    return {
        supported: true,
        sample: async () => {
            const stdout = await runNettop();
            if (stdout === null) return null;
            return parseNettop(stdout);
        },
    };
}

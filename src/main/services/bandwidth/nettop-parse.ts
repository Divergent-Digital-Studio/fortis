import type { BandwidthSample } from './bandwidth-delta';

function parsePid(column: string): { name: string; pid: number } | null {
    const lastDot = column.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === column.length - 1) return null;
    const name = column.slice(0, lastDot);
    const pidPart = column.slice(lastDot + 1);
    if (!/^\d+$/.test(pidPart)) return null;
    const pid = Number.parseInt(pidPart, 10);
    if (!Number.isFinite(pid)) return null;
    return { name, pid };
}

export function parseNettop(stdout: string): BandwidthSample[] {
    const samples: BandwidthSample[] = [];
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        const columns = trimmed.split(',');
        if (columns.length < 3) continue;
        const first = columns[0];
        if (first === undefined) continue;
        const parsed = parsePid(first.trim());
        if (!parsed) continue;
        const rxRaw = columns[1];
        const txRaw = columns[2];
        if (rxRaw === undefined || txRaw === undefined) continue;
        const rxBytes = Number.parseInt(rxRaw.trim(), 10);
        const txBytes = Number.parseInt(txRaw.trim(), 10);
        if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
        samples.push({ pid: parsed.pid, processName: parsed.name, rxBytes, txBytes });
    }
    return samples;
}

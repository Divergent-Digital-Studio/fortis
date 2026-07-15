import type { UpdateStatus } from '@shared/types/m4';

export type UpdateEvent =
    | { type: 'checking' }
    | { type: 'available'; version: string; notes?: string }
    | { type: 'not-available' }
    | { type: 'progress'; percent: number }
    | { type: 'downloaded'; version: string }
    | { type: 'error'; message: string }
    | { type: 'disabled' };

export function parseVersion(value: string): [number, number, number] {
    const cleaned = value.trim().replace(/^v/i, '');
    const core = cleaned.split('-')[0] ?? '';
    const parts = core.split('.');
    const num = (i: number): number => {
        const raw = parts[i];
        const n = raw === undefined ? 0 : Number.parseInt(raw, 10);
        return Number.isFinite(n) ? n : 0;
    };
    return [num(0), num(1), num(2)];
}

export function isNewer(candidate: string, current: string): boolean {
    const a = parseVersion(candidate);
    const b = parseVersion(current);
    for (let i = 0; i < 3; i++) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        if (av > bv) return true;
        if (av < bv) return false;
    }
    return false;
}

function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
}

export function nextUpdateState(_prev: UpdateStatus, event: UpdateEvent): UpdateStatus {
    switch (event.type) {
        case 'checking':
            return { kind: 'checking' };
        case 'available':
            return event.notes !== undefined
                ? { kind: 'available', version: event.version, notes: event.notes }
                : { kind: 'available', version: event.version };
        case 'not-available':
            return { kind: 'not-available' };
        case 'progress':
            return { kind: 'downloading', percent: clampPercent(event.percent) };
        case 'downloaded':
            return { kind: 'downloaded', version: event.version };
        case 'error':
            return { kind: 'error', error: event.message };
        case 'disabled':
            return { kind: 'disabled' };
    }
}

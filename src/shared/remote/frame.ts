import type { NetworkConnection } from '../types/connection';
import type { Alert } from '../types/alert';

export const FRAME_VERSION = 1;
const MAX_FRAME_BYTES = 2_000_000;

export interface HelloFrame {
    v: number;
    type: 'hello';
    ts: number;
    agentId: string;
    platform: string;
    token: string;
}
export interface WelcomeFrame {
    v: number;
    type: 'welcome';
    ts: number;
    serverVersion: string;
}
export interface ConnectionsFrame {
    v: number;
    type: 'connections';
    ts: number;
    connections: NetworkConnection[];
}
export interface AlertFrame {
    v: number;
    type: 'alert';
    ts: number;
    alert: Alert;
}
export interface PingFrame {
    v: number;
    type: 'ping';
    ts: number;
}
export interface PongFrame {
    v: number;
    type: 'pong';
    ts: number;
}

export type RemoteFrame =
    | HelloFrame
    | WelcomeFrame
    | ConnectionsFrame
    | AlertFrame
    | PingFrame
    | PongFrame;

export function encodeFrame(frame: RemoteFrame): string {
    return JSON.stringify(frame);
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function decodeFrame(raw: string): RemoteFrame | null {
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_FRAME_BYTES) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (typeof parsed.v !== 'number' || typeof parsed.ts !== 'number') return null;
    switch (parsed.type) {
        case 'hello':
            if (
                typeof parsed.agentId === 'string' &&
                typeof parsed.platform === 'string' &&
                typeof parsed.token === 'string'
            ) {
                return parsed as unknown as HelloFrame;
            }
            return null;
        case 'welcome':
            return typeof parsed.serverVersion === 'string' ? (parsed as unknown as WelcomeFrame) : null;
        case 'connections':
            return Array.isArray(parsed.connections) ? (parsed as unknown as ConnectionsFrame) : null;
        case 'alert':
            return isRecord(parsed.alert) ? (parsed as unknown as AlertFrame) : null;
        case 'ping':
            return parsed as unknown as PingFrame;
        case 'pong':
            return parsed as unknown as PongFrame;
        default:
            return null;
    }
}

export function isHelloFrame(f: RemoteFrame | null): f is HelloFrame {
    return f !== null && f.type === 'hello';
}
export function isConnectionsFrame(f: RemoteFrame | null): f is ConnectionsFrame {
    return f !== null && f.type === 'connections';
}
export function isAlertFrame(f: RemoteFrame | null): f is AlertFrame {
    return f !== null && f.type === 'alert';
}

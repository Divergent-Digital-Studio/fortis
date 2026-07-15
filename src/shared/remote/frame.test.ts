import { describe, it, expect } from 'vitest';
import {
    encodeFrame,
    decodeFrame,
    isHelloFrame,
    isConnectionsFrame,
    isAlertFrame,
    type RemoteFrame,
} from './frame';

describe('frame', () => {
    it('round-trips a hello frame', () => {
        const f: RemoteFrame = { v: 1, type: 'hello', ts: 100, agentId: 'a', platform: 'linux', token: 'secret' };
        const decoded = decodeFrame(encodeFrame(f));
        expect(decoded).toEqual(f);
        expect(isHelloFrame(decoded)).toBe(true);
    });

    it('returns null on malformed JSON', () => {
        expect(decodeFrame('{not json')).toBeNull();
    });

    it('returns null on missing required fields', () => {
        expect(decodeFrame(JSON.stringify({ type: 'hello' }))).toBeNull();
    });

    it('returns null on unknown frame type', () => {
        expect(decodeFrame(JSON.stringify({ v: 1, type: 'bogus', ts: 1 }))).toBeNull();
    });

    it('type-guards connections and alert frames', () => {
        const c: RemoteFrame = { v: 1, type: 'connections', ts: 1, connections: [] };
        const a: RemoteFrame = { v: 1, type: 'alert', ts: 1, alert: { id: 'x' } as never };
        expect(isConnectionsFrame(decodeFrame(encodeFrame(c)))).toBe(true);
        expect(isAlertFrame(decodeFrame(encodeFrame(a)))).toBe(true);
    });

    it('rejects oversized payloads', () => {
        const big = 'x'.repeat(2_000_001);
        expect(decodeFrame(big)).toBeNull();
    });
});

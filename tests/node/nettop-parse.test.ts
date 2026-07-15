import { describe, it, expect } from 'vitest';
import { parseNettop } from '@main/services/bandwidth/nettop-parse';

const FIXTURE = [
    'time,bytes_in,bytes_out',
    'Safari.456,1000,2000,extra,columns',
    'mDNSResponder.78,512,128',
    'malformed-line-without-pid,nope,nope',
    '',
    'com.apple.Music.9012,4096,8192',
].join('\n');

describe('parseNettop', () => {
    it('parses name, pid, rx and tx for valid rows', () => {
        const out = parseNettop(FIXTURE);
        const safari = out.find((s) => s.pid === 456);
        expect(safari).toMatchObject({ pid: 456, processName: 'Safari', rxBytes: 1000, txBytes: 2000 });
    });

    it('keeps the pid as the digits after the last dot', () => {
        const out = parseNettop(FIXTURE);
        const music = out.find((s) => s.pid === 9012);
        expect(music).toMatchObject({ pid: 9012, processName: 'com.apple.Music', rxBytes: 4096, txBytes: 8192 });
    });

    it('skips the header and malformed/blank rows without throwing', () => {
        const out = parseNettop(FIXTURE);
        expect(out).toHaveLength(3);
        expect(out.some((s) => s.processName.includes('time'))).toBe(false);
        expect(out.some((s) => s.processName.includes('malformed'))).toBe(false);
    });

    it('returns an empty array for empty input', () => {
        expect(parseNettop('')).toEqual([]);
    });
});

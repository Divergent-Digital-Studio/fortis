import { describe, it, expect } from 'vitest';
import { parseVersion, isNewer, nextUpdateState } from './update-logic';
import type { UpdateStatus } from '@shared/types/m4';

describe('parseVersion', () => {
    it('parses major.minor.patch', () => {
        expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    });
    it('ignores a leading v and pre-release suffix', () => {
        expect(parseVersion('v2.0.1-beta.1')).toEqual([2, 0, 1]);
    });
    it('returns zeros for garbage', () => {
        expect(parseVersion('not-a-version')).toEqual([0, 0, 0]);
    });
});

describe('isNewer', () => {
    it('detects a newer patch', () => {
        expect(isNewer('1.0.1', '1.0.0')).toBe(true);
    });
    it('detects a newer minor over a lower patch', () => {
        expect(isNewer('1.1.0', '1.0.9')).toBe(true);
    });
    it('returns false for equal versions', () => {
        expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    });
    it('returns false for an older version', () => {
        expect(isNewer('1.0.0', '1.2.0')).toBe(false);
    });
});

describe('nextUpdateState', () => {
    const idle: UpdateStatus = { kind: 'idle' };
    it('checking-requested produces checking', () => {
        expect(nextUpdateState(idle, { type: 'checking' }).kind).toBe('checking');
    });
    it('available carries version and notes', () => {
        const s = nextUpdateState(idle, { type: 'available', version: '1.1.0', notes: 'x' });
        expect(s).toEqual({ kind: 'available', version: '1.1.0', notes: 'x' });
    });
    it('available without notes omits notes', () => {
        const s = nextUpdateState(idle, { type: 'available', version: '1.1.0' });
        expect(s).toEqual({ kind: 'available', version: '1.1.0' });
    });
    it('not-available', () => {
        expect(nextUpdateState(idle, { type: 'not-available' }).kind).toBe('not-available');
    });
    it('progress clamps percent to 0..100', () => {
        expect(nextUpdateState(idle, { type: 'progress', percent: 150 })).toEqual({
            kind: 'downloading',
            percent: 100,
        });
        expect(nextUpdateState(idle, { type: 'progress', percent: -5 }).percent).toBe(0);
    });
    it('downloaded carries version', () => {
        const s = nextUpdateState(idle, { type: 'downloaded', version: '1.1.0' });
        expect(s).toEqual({ kind: 'downloaded', version: '1.1.0' });
    });
    it('error carries message', () => {
        expect(nextUpdateState(idle, { type: 'error', message: 'boom' })).toEqual({
            kind: 'error',
            error: 'boom',
        });
    });
    it('disabled', () => {
        expect(nextUpdateState(idle, { type: 'disabled' }).kind).toBe('disabled');
    });
});

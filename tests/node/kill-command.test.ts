import { describe, it, expect } from 'vitest';
import { buildKillCommand } from '@main/services/defense/kill-command';

describe('buildKillCommand', () => {
    it('posix kill', () => {
        expect(buildKillCommand('linux', 1234)).toEqual({ cmd: 'kill', args: ['-TERM', '1234'] });
    });
    it('mac kill', () => {
        expect(buildKillCommand('darwin', 1234).cmd).toBe('kill');
    });
    it('win taskkill', () => {
        expect(buildKillCommand('win32', 1234)).toEqual({ cmd: 'taskkill', args: ['/PID', '1234', '/F'] });
    });
    it('rejects bad pid', () => {
        expect(() => buildKillCommand('linux', 0)).toThrow();
        expect(() => buildKillCommand('linux', -5)).toThrow();
        expect(() => buildKillCommand('linux', 1.5)).toThrow();
    });
});

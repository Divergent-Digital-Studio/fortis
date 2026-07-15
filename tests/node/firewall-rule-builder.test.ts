import { describe, it, expect } from 'vitest';
import { buildBlockCommand, buildUnblockCommand } from '@main/services/defense/firewall-rule-builder';

describe('buildBlockCommand', () => {
    it('linux ufw', () => {
        const r = buildBlockCommand('linux', '1.2.3.4');
        expect(r.cmd).toBe('ufw');
        expect(r.args).toEqual(['insert', '1', 'deny', 'from', '1.2.3.4']);
    });
    it('win netsh', () => {
        const r = buildBlockCommand('win32', '1.2.3.4');
        expect(r.cmd).toBe('netsh');
        expect(r.args.join(' ')).toContain('remoteip=1.2.3.4');
    });
    it('mac pfctl', () => {
        const r = buildBlockCommand('darwin', '1.2.3.4');
        expect(r.cmd).toBe('pfctl');
        expect(r.args).toEqual(['-t', 'fortis_blocklist', '-T', 'add', '1.2.3.4']);
    });
    it('rejects bad ip', () => {
        expect(() => buildBlockCommand('linux', 'not-an-ip')).toThrow();
    });
    it('rejects unsupported platform', () => {
        expect(() => buildBlockCommand('aix' as never, '1.2.3.4')).toThrow();
    });
});

describe('buildUnblockCommand', () => {
    it('linux ufw delete', () => {
        const r = buildUnblockCommand('linux', '1.2.3.4');
        expect(r.args).toEqual(['delete', 'deny', 'from', '1.2.3.4']);
    });
    it('mac pfctl delete', () => {
        const r = buildUnblockCommand('darwin', '1.2.3.4');
        expect(r.args).toEqual(['-t', 'fortis_blocklist', '-T', 'delete', '1.2.3.4']);
    });
    it('rejects unsupported platform', () => {
        expect(() => buildUnblockCommand('aix' as never, '1.2.3.4')).toThrow();
    });
});

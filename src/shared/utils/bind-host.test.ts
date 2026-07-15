import { describe, it, expect } from 'vitest';
import { isValidBindHost, isPubliclyBound } from './bind-host';

describe('isValidBindHost', () => {
    it('accepts loopback, wildcard, LAN IPv4 and hostnames', () => {
        for (const host of ['127.0.0.1', '0.0.0.0', '192.168.0.172', 'localhost', 'fortis.local', '::1', '::']) {
            expect(isValidBindHost(host), host).toBe(true);
        }
    });

    it('rejects malformed hosts', () => {
        for (const host of ['', '   ', '999.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', 'has space', 'a..b', '-lead.com', 'http://x', '10.0.0.1:47600', 'x'.repeat(254)]) {
            expect(isValidBindHost(host), host).toBe(false);
        }
    });

    it('rejects non-strings', () => {
        for (const v of [null, undefined, 47600, {}, []]) {
            expect(isValidBindHost(v)).toBe(false);
        }
    });
});

describe('isPubliclyBound', () => {
    it('treats loopback as private', () => {
        for (const host of ['127.0.0.1', '::1', 'localhost', ' localhost ']) {
            expect(isPubliclyBound(host), host).toBe(false);
        }
    });

    it('treats wildcard and LAN addresses as public', () => {
        for (const host of ['0.0.0.0', '::', '192.168.0.172', 'fortis.local']) {
            expect(isPubliclyBound(host), host).toBe(true);
        }
    });
});

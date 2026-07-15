import { describe, it, expect } from 'vitest';
import { parseCert } from '@main/services/net/cert-parse';

const DAY = 24 * 60 * 60 * 1000;
const now = 1_700_000_000_000;
const base = (over: Record<string, unknown> = {}) => ({
    issuer: { O: 'Lets Encrypt', CN: 'R3' },
    subject: { CN: 'example.com' },
    valid_from: new Date(now - 30 * DAY).toUTCString(),
    valid_to: new Date(now + 60 * DAY).toUTCString(),
    ...over,
});

describe('parseCert', () => {
    it('valid cert', () => {
        const c = parseCert(base() as never, 'example.com', 443, now);
        expect(c.status).toBe('valid');
        expect(c.daysUntilExpiry).toBe(60);
        expect(c.selfSigned).toBe(false);
        expect(c.issuer).toBe('R3');
    });

    it('expiring (<14d)', () => {
        const c = parseCert(base({ valid_to: new Date(now + 5 * DAY).toUTCString() }) as never, 'h', 443, now);
        expect(c.status).toBe('expiring');
    });

    it('expired', () => {
        const c = parseCert(base({ valid_to: new Date(now - DAY).toUTCString() }) as never, 'h', 443, now);
        expect(c.status).toBe('expired');
    });

    it('self-signed (issuer == subject)', () => {
        const c = parseCert(
            base({ issuer: { CN: 'example.com' }, subject: { CN: 'example.com' } }) as never,
            'h',
            443,
            now,
        );
        expect(c.selfSigned).toBe(true);
        expect(c.status).toBe('self-signed');
    });

    it('missing fields → error, total', () => {
        const c = parseCert({} as never, 'h', 443, now);
        expect(c.status).toBe('error');
        expect(c.hostPort).toBe('h:443');
    });
});

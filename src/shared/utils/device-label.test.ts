import { describe, it, expect } from 'vitest';
import { prettifyHostname, deviceLabel } from './device-label';
import type { WifiDevice } from '../types/m1';

function device(overrides: Partial<WifiDevice>): WifiDevice {
    return {
        mac: 'a0:b5:3c:37:08:4d',
        ip: '192.168.0.1',
        vendor: null,
        hostname: null,
        customName: null,
        firstSeen: 0,
        lastSeen: 0,
        isIot: false,
        iotCategory: null,
        ...overrides,
    };
}

describe('prettifyHostname', () => {
    it('strips router suffixes and separators', () => {
        expect(prettifyHostname('Amirs-iPhone-16.modem')).toBe('Amirs iPhone 16');
        expect(prettifyHostname('Amir-HomePod.local')).toBe('Amir HomePod');
        expect(prettifyHostname('living_room_tv.lan')).toBe('living room tv');
    });

    it('rejects names that carry no information', () => {
        expect(prettifyHostname(null)).toBeNull();
        expect(prettifyHostname('   ')).toBeNull();
        expect(prettifyHostname('.modem')).toBeNull();
        expect(prettifyHostname('192-168-0-140.modem')).toBeNull();
    });
});

describe('deviceLabel', () => {
    it('prefers the user-set name over everything', () => {
        const d = device({ customName: 'Kitchen iPad', hostname: 'ipad.modem', vendor: 'Apple' });
        expect(deviceLabel(d)).toBe('Kitchen iPad');
    });

    it('falls back through hostname, then vendor', () => {
        expect(deviceLabel(device({ hostname: 'Amirs-iPhone-16.modem', vendor: 'Apple' }))).toBe('Amirs iPhone 16');
        expect(deviceLabel(device({ vendor: 'Apple' }))).toBe('Apple device');
        expect(deviceLabel(device({ vendor: 'Amazon', iotCategory: 'Speaker' }))).toBe('Amazon Speaker');
    });

    it('never shows a useless hostname when a vendor is known', () => {
        expect(deviceLabel(device({ hostname: '192-168-0-140.modem', vendor: 'Apple' }))).toBe('Apple device');
    });

    it('shows the MAC only when nothing else is known', () => {
        expect(deviceLabel(device({}))).toBe('Unknown device (a0:b5:3c:37:08:4d)');
    });
});

import { describe, it, expect } from 'vitest';
import { detectPlatform, downloadAssetName } from '../../website/detect';

describe('detectPlatform', () => {
    it('detects macOS arm64', () => {
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit arm64';
        expect(detectPlatform(ua, 'MacIntel')).toEqual({ os: 'mac', arch: 'arm64' });
    });
    it('detects macOS x64 by default', () => {
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)';
        expect(detectPlatform(ua, 'MacIntel')).toEqual({ os: 'mac', arch: 'x64' });
    });
    it('detects Windows', () => {
        expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32')).toEqual({
            os: 'win',
            arch: 'x64',
        });
    });
    it('detects Linux', () => {
        expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64')).toEqual({
            os: 'linux',
            arch: 'x64',
        });
    });
    it('does not treat Android as Linux desktop', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 14)';
        expect(detectPlatform(ua, '')).toEqual({ os: 'mac', arch: 'x64' });
    });
    it('falls back to mac/x64 for unknown', () => {
        expect(detectPlatform('something', '')).toEqual({ os: 'mac', arch: 'x64' });
    });
});

describe('downloadAssetName', () => {
    it('builds mac arm64 dmg', () => {
        expect(downloadAssetName({ os: 'mac', arch: 'arm64' }, '1.0.0')).toBe(
            'Fortis-1.0.0-arm64.dmg',
        );
    });
    it('builds mac x64 dmg', () => {
        expect(downloadAssetName({ os: 'mac', arch: 'x64' }, '1.0.0')).toBe('Fortis-1.0.0.dmg');
    });
    it('builds windows exe', () => {
        expect(downloadAssetName({ os: 'win', arch: 'x64' }, '1.0.0')).toBe(
            'Fortis-1.0.0-setup.exe',
        );
    });
    it('builds linux AppImage', () => {
        expect(downloadAssetName({ os: 'linux', arch: 'x64' }, '1.0.0')).toBe(
            'Fortis-1.0.0.AppImage',
        );
    });
});

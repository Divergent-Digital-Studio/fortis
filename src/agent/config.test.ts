import { describe, it, expect } from 'vitest';
import { loadAgentConfig } from './config';

describe('loadAgentConfig', () => {
    it('parses a full config', () => {
        const cfg = loadAgentConfig(
            JSON.stringify({ serverUrl: 'ws://1.2.3.4:47600', token: 't', scanIntervalMs: 8000 }),
            {},
        );
        expect(cfg).toEqual({
            serverUrl: 'ws://1.2.3.4:47600',
            token: 't',
            scanIntervalMs: 8000,
            rulesPath: null,
            logLevel: 'info',
        });
    });

    it('env token overrides file token', () => {
        const cfg = loadAgentConfig(JSON.stringify({ serverUrl: 'ws://x:1', token: 'file' }), {
            FORTIS_AGENT_TOKEN: 'env',
        });
        expect(cfg.token).toBe('env');
    });

    it('applies default scan interval', () => {
        const cfg = loadAgentConfig(JSON.stringify({ serverUrl: 'ws://x:1', token: 't' }), {});
        expect(cfg.scanIntervalMs).toBe(10000);
    });

    it('throws on missing serverUrl', () => {
        expect(() => loadAgentConfig(JSON.stringify({ token: 't' }), {})).toThrow(/serverUrl/);
    });

    it('throws on missing token', () => {
        expect(() => loadAgentConfig(JSON.stringify({ serverUrl: 'ws://x:1' }), {})).toThrow(/token/);
    });

    it('throws on malformed json', () => {
        expect(() => loadAgentConfig('{bad', {})).toThrow(/config/i);
    });
});

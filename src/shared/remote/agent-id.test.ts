import { describe, it, expect } from 'vitest';
import { deriveAgentId, agentLabel } from './agent-id';

describe('agent-id', () => {
    it('is stable for the same host+platform', () => {
        expect(deriveAgentId('box1', 'linux')).toBe(deriveAgentId('box1', 'linux'));
    });
    it('differs across hosts', () => {
        expect(deriveAgentId('box1', 'linux')).not.toBe(deriveAgentId('box2', 'linux'));
    });
    it('produces a short hex id', () => {
        expect(deriveAgentId('box1', 'linux')).toMatch(/^[0-9a-f]{12}$/);
    });
    it('label combines host and platform', () => {
        expect(agentLabel('box1', 'linux')).toBe('box1 (linux)');
    });
});

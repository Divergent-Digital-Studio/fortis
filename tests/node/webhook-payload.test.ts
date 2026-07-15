import { describe, it, expect } from 'vitest';
import { buildWebhookBody, inferWebhookKind } from '@main/services/webhook/webhook-payload';
import type { Alert } from '@shared/types/alert';

const alert = {
    id: 'a1',
    timestamp: 0,
    type: 'system',
    threatLevel: 'danger',
    title: 'Threat',
    description: 'Bad thing',
    connectionId: 'c',
    recommendation: 'Do x',
    acknowledged: false,
    whitelisted: false,
    dedupKey: 'k',
    suppressedCount: 0,
    createdAt: 0,
} as Alert;

describe('inferWebhookKind', () => {
    it('slack', () => expect(inferWebhookKind('https://hooks.slack.com/services/x')).toBe('slack'));
    it('discord', () => expect(inferWebhookKind('https://discord.com/api/webhooks/x')).toBe('discord'));
    it('generic', () => expect(inferWebhookKind('https://example.com/hook')).toBe('generic'));
});

describe('buildWebhookBody', () => {
    it('slack uses text', () => {
        const b = buildWebhookBody('slack', alert) as { text: string };
        expect(b.text).toContain('Threat');
    });
    it('discord uses content', () => {
        const b = buildWebhookBody('discord', alert) as { content: string };
        expect(b.content).toContain('Threat');
    });
    it('generic includes structured fields', () => {
        const b = buildWebhookBody('generic', alert) as { title: string; threatLevel: string };
        expect(b.title).toBe('Threat');
        expect(b.threatLevel).toBe('danger');
    });
});

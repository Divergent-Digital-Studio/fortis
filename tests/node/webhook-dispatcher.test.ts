import { describe, it, expect, vi } from 'vitest';
import { WebhookDispatcher } from '@main/services/webhook-dispatcher';
import type { DatabaseService } from '@main/services/database';
import type { FortisEventBus } from '@main/services/event-bus';
import type { UserSettings } from '@shared/types/settings';

function fakeDatabase(settings: { webhookEnabled: boolean; webhookUrl: string }): DatabaseService {
    return {
        getSetting: <K extends keyof UserSettings>(key: K): UserSettings[K] =>
            (settings as Record<string, unknown>)[key as string] as UserSettings[K],
    } as unknown as DatabaseService;
}

const eventBus = { on: vi.fn(), off: vi.fn() } as unknown as FortisEventBus;

describe('WebhookDispatcher.test', () => {
    it('posts a JSON probe body and resolves true on ok', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
        const dispatcher = new WebhookDispatcher({
            database: fakeDatabase({ webhookEnabled: true, webhookUrl: 'https://example.com/hook' }),
            eventBus,
            fetchFn,
            backoffMs: 0,
        });

        const result = await dispatcher.test('https://example.com/hook');

        expect(result).toBe(true);
        expect(fetchFn).toHaveBeenCalledTimes(1);
        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe('https://example.com/hook');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(() => JSON.parse(init.body)).not.toThrow();
    });

    it('rejects an invalid url without calling fetch', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
        const dispatcher = new WebhookDispatcher({
            database: fakeDatabase({ webhookEnabled: true, webhookUrl: 'not-a-url' }),
            eventBus,
            fetchFn,
            backoffMs: 0,
        });

        const result = await dispatcher.test('not-a-url');

        expect(result).toBe(false);
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('returns false after exhausting retries on non-ok responses', async () => {
        const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }));
        const dispatcher = new WebhookDispatcher({
            database: fakeDatabase({ webhookEnabled: true, webhookUrl: 'https://example.com/hook' }),
            eventBus,
            fetchFn,
            backoffMs: 0,
        });

        const result = await dispatcher.test('https://example.com/hook');

        expect(result).toBe(false);
        expect(fetchFn).toHaveBeenCalledTimes(3);
    });
});

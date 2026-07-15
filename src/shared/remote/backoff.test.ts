import { describe, it, expect } from 'vitest';
import { nextBackoffDelay, BackoffController } from './backoff';

describe('backoff', () => {
    it('grows exponentially capped, no jitter when rng=0', () => {
        const opts = { baseMs: 1000, capMs: 30000, rng: () => 0 };
        expect(nextBackoffDelay(0, opts)).toBe(0);
        expect(nextBackoffDelay(1, opts)).toBe(0);
    });

    it('full jitter never exceeds the capped ceiling', () => {
        const opts = { baseMs: 1000, capMs: 30000, rng: () => 1 };
        expect(nextBackoffDelay(0, opts)).toBe(1000);
        expect(nextBackoffDelay(2, opts)).toBe(4000);
        expect(nextBackoffDelay(10, opts)).toBe(30000);
    });

    it('jitter scales with the multiplier', () => {
        const d = nextBackoffDelay(3, { baseMs: 1000, capMs: 30000, rng: () => 0.5 });
        expect(d).toBe(4000);
    });

    it('controller increments and resets', () => {
        const c = new BackoffController({ baseMs: 1000, capMs: 30000, rng: () => 1 });
        expect(c.next()).toBe(1000);
        expect(c.next()).toBe(2000);
        c.reset();
        expect(c.next()).toBe(1000);
    });
});

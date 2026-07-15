import { describe, it, expect } from 'vitest';
import { createNoopPowerSource } from './power-source';

describe('power-source noop', () => {
    it('reports AC power and zero idle', () => {
        const ps = createNoopPowerSource();
        expect(ps.isOnBattery()).toBe(false);
        expect(ps.getIdleSeconds()).toBe(0);
    });

    it('on/off never throw and never invoke the listener', () => {
        const ps = createNoopPowerSource();
        let called = false;
        const listener = (): void => {
            called = true;
        };
        expect(() => ps.on('suspend', listener)).not.toThrow();
        expect(() => ps.off('suspend', listener)).not.toThrow();
        expect(called).toBe(false);
    });
});

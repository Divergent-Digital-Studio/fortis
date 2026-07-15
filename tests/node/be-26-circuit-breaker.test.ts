import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker } from '@main/utils/circuit-breaker'

describe('BE-26 #4 getState() is a pure read', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('repeated getState() after reset window stays HALF_OPEN without consuming probe', async () => {
        const cb = new CircuitBreaker({ name: 't', failureThreshold: 1, resetTimeoutMs: 1000 })

        await expect(cb.execute(async () => { throw new Error('fail') })).rejects.toThrow()
        expect(cb.getState()).toBe('OPEN')

        vi.advanceTimersByTime(1001)

        expect(cb.getState()).toBe('HALF_OPEN')
        expect(cb.getState()).toBe('HALF_OPEN')
        expect(cb.getState()).toBe('HALF_OPEN')
    })
})

describe('BE-26 #5 HALF_OPEN admits only one concurrent probe', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('second concurrent probe in HALF_OPEN is rejected', async () => {
        const cb = new CircuitBreaker({ name: 't', failureThreshold: 1, resetTimeoutMs: 1000 })

        await expect(cb.execute(async () => { throw new Error('fail') })).rejects.toThrow()
        vi.advanceTimersByTime(1001)

        let releaseFirst: () => void = () => {}
        const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })

        const firstProbe = cb.execute(async () => {
            await firstGate
            return 'ok'
        })

        const secondProbe = cb.execute(async () => 'second')

        await expect(secondProbe).rejects.toThrow()

        releaseFirst()
        await expect(firstProbe).resolves.toBe('ok')
    })
})

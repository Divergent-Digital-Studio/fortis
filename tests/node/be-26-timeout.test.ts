import { describe, it, expect } from 'vitest'
import { analyzeWithRetry } from '@main/services/ai-prompt'
import type { AnonymizedPayload } from '@shared/types/analysis'

const payload: AnonymizedPayload = {
    connections: [
        { id: 'c1', protocol: 'tcp', localPort: 1, remoteAddress: '93.184.216.1', remotePort: 443, state: 'ESTABLISHED', processName: 'p', isNew: true, isChanged: false },
    ],
    scanTimestamp: Date.now(),
    platform: 'macOS',
    totalActive: 1,
}

describe('BE-26 #6 outer abort budget is wired into the request', () => {
    it('aborts at ~90ms when outer signal is 90ms, not the per-attempt ceiling', async () => {
        const outer = AbortSignal.timeout(90)
        const start = Date.now()

        await expect(
            analyzeWithRetry(payload, 'routine', (_sys, _user, signal) => {
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        reject(new Error('aborted by signal'))
                    })
                })
            }, outer),
        ).rejects.toThrow()

        const elapsed = Date.now() - start
        expect(elapsed).toBeLessThan(1000)
        expect(elapsed).toBeGreaterThanOrEqual(80)
    })

    it('the signal passed to analyzeFn is an AbortSignal combining the outer budget', async () => {
        let received: AbortSignal | null = null
        const outer = AbortSignal.timeout(50)

        await expect(
            analyzeWithRetry(payload, 'routine', (_sys, _user, signal) => {
                received = signal
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(new Error('aborted')))
                })
            }, outer),
        ).rejects.toThrow()

        expect(received).not.toBeNull()
        expect((received as unknown as AbortSignal).aborted).toBe(true)
    })
})

import { describe, it, expect, vi } from 'vitest'
import { resolveHostnames } from './hostname-resolver'

function makeReverse(map: Record<string, string[] | Error>): (ip: string) => Promise<string[]> {
    return (ip: string) => {
        const entry = map[ip]
        if (entry instanceof Error) return Promise.reject(entry)
        return Promise.resolve(entry ?? [])
    }
}

describe('resolveHostnames', () => {
    it('resolves private-range addresses (unlike the dns collector)', async () => {
        const reverse = makeReverse({
            '192.168.1.42': ['living-room-speaker.local'],
            '10.0.0.5': ['nas.local', 'nas-2.local'],
        })
        const result = await resolveHostnames(['192.168.1.42', '10.0.0.5'], { reverse })
        expect(result.get('192.168.1.42')).toBe('living-room-speaker.local')
        // Takes the first hostname only
        expect(result.get('10.0.0.5')).toBe('nas.local')
    })

    it('drops addresses that fail to resolve', async () => {
        const reverse = makeReverse({
            '192.168.1.1': ['router.local'],
            '192.168.1.99': new Error('ENOTFOUND'),
        })
        const result = await resolveHostnames(['192.168.1.1', '192.168.1.99'], { reverse })
        expect(result.has('192.168.1.1')).toBe(true)
        expect(result.has('192.168.1.99')).toBe(false)
    })

    it('drops addresses with an empty PTR result', async () => {
        const reverse = makeReverse({ '192.168.1.1': [] })
        const result = await resolveHostnames(['192.168.1.1'], { reverse })
        expect(result.size).toBe(0)
    })

    it('times out a slow lookup instead of hanging', async () => {
        const reverse = vi.fn(
            (): Promise<string[]> => new Promise((resolve) => setTimeout(() => resolve(['late.local']), 1000)),
        )
        const result = await resolveHostnames(['192.168.1.1'], { reverse, timeoutMs: 50 })
        expect(result.size).toBe(0)
    })

    it('dedupes the input addresses', async () => {
        const reverse = vi.fn((_ip: string): Promise<string[]> => Promise.resolve(['router.local']))
        const result = await resolveHostnames(['192.168.1.1', '192.168.1.1', '192.168.1.1'], { reverse })
        expect(result.size).toBe(1)
        expect(reverse).toHaveBeenCalledTimes(1)
    })

    it('respects the maxLookups cap', async () => {
        const reverse = makeReverse({
            '192.168.1.1': ['a.local'],
            '192.168.1.2': ['b.local'],
            '192.168.1.3': ['c.local'],
        })
        const result = await resolveHostnames(['192.168.1.1', '192.168.1.2', '192.168.1.3'], {
            reverse,
            maxLookups: 2,
        })
        expect(result.size).toBe(2)
    })
})

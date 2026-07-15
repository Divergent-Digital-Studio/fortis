import { describe, it, expect, vi, beforeEach } from 'vitest'

const networkConnectionsMock = vi.fn()

vi.mock('systeminformation', () => ({
    default: { networkConnections: networkConnectionsMock },
    networkConnections: networkConnectionsMock,
}))

describe('BE-13 SystemInfoFallbackAdapter resilience and import caching', () => {
    beforeEach(() => {
        networkConnectionsMock.mockReset()
    })

    it('maps connections when systeminformation resolves', async () => {
        networkConnectionsMock.mockResolvedValue([
            {
                protocol: 'tcp',
                localAddress: '10.0.0.2',
                localPort: '443',
                peerAddress: '93.184.216.34',
                peerPort: '51000',
                state: 'ESTABLISHED',
                pid: 222,
                process: 'curl',
            },
        ])

        const { SystemInfoFallbackAdapter } = await import('@main/utils/parsers/systeminformation-adapter')
        const conns = await new SystemInfoFallbackAdapter().parse()

        expect(conns).toHaveLength(1)
        expect(conns[0]!.remoteAddress).toBe('93.184.216.34')
        expect(conns[0]!.processName).toBe('curl')
    })

    it('returns [] instead of throwing when systeminformation rejects', async () => {
        networkConnectionsMock.mockRejectedValue(new Error('si exploded'))

        const { SystemInfoFallbackAdapter } = await import('@main/utils/parsers/systeminformation-adapter')
        const conns = await new SystemInfoFallbackAdapter().parse()

        expect(conns).toEqual([])
    })
})

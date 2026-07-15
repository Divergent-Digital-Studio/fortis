import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IPC_CHANNELS } from '@shared/types/ipc'

const PRELOAD_SOURCE = readFileSync(resolve(__dirname, '../../src/preload/index.ts'), 'utf8')

const M1_CHANNELS = [
    IPC_CHANNELS.DEVICES_GET,
    IPC_CHANNELS.DEVICES_UPDATE,
    IPC_CHANNELS.DNS_GET,
    IPC_CHANNELS.DNS_UPDATE,
    IPC_CHANNELS.VPN_STATUS_GET,
    IPC_CHANNELS.VPN_STATUS_UPDATE,
    IPC_CHANNELS.GEO_GET,
    IPC_CHANNELS.GEO_UPDATE,
    IPC_CHANNELS.IOT_GET,
    IPC_CHANNELS.IOT_UPDATE,
]

const M1_API_METHODS = [
    'getDevices',
    'onDevicesUpdate',
    'getDnsQueries',
    'onDnsUpdate',
    'getVpnStatus',
    'onVpnUpdate',
    'getGeoConnections',
    'onGeoUpdate',
    'getIotDevices',
    'onIotUpdate',
]

describe('M1 preload contract', () => {
    it('declares every M1 channel constant uniquely', () => {
        const values = Object.values(IPC_CHANNELS)
        expect(new Set(values).size).toBe(values.length)
        for (const channel of M1_CHANNELS) {
            expect(values).toContain(channel)
        }
    })

    it('exposes every M1 channel through the preload bridge', () => {
        for (const channel of M1_CHANNELS) {
            const constName = Object.keys(IPC_CHANNELS).find(
                (key) => IPC_CHANNELS[key as keyof typeof IPC_CHANNELS] === channel,
            )
            expect(constName, `channel ${channel} should have a constant`).toBeDefined()
            expect(PRELOAD_SOURCE).toContain(`IPC_CHANNELS.${constName}`)
        }
    })

    it('exposes every M1 FortisAPI method in the preload bridge', () => {
        for (const method of M1_API_METHODS) {
            expect(PRELOAD_SOURCE).toContain(`${method}:`)
        }
    })
})

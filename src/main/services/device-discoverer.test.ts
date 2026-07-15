import { describe, it, expect, vi } from 'vitest'
import { DeviceDiscoverer } from './device-discoverer'
import type { WifiDevice } from '@shared/types/m1'
import type { IDatabaseService } from './database'
import type { FortisEventBus } from './event-bus'

/**
 * Minimal in-memory database stub — only the surface DeviceDiscoverer touches.
 */
function makeDatabase(): IDatabaseService & { devices: Map<string, WifiDevice> } {
    const devices = new Map<string, WifiDevice>()
    const stub = {
        devices,
        getWifiDevices: () => Array.from(devices.values()),
        upsertWifiDevice: (device: WifiDevice) => {
            devices.set(device.mac, device)
        },
        saveAlert: () => 'alert-1',
    }
    return stub as unknown as IDatabaseService & { devices: Map<string, WifiDevice> }
}

function makeEventBus(): FortisEventBus {
    return { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as unknown as FortisEventBus
}

describe('DeviceDiscoverer hostname resolution', () => {
    it('uses the ARP hostname when present and skips reverse-DNS', async () => {
        const database = makeDatabase()
        const resolveHostnames = vi.fn(() => Promise.resolve(new Map<string, string>()))
        const discoverer = new DeviceDiscoverer({
            database,
            eventBus: makeEventBus(),
            ouiMap: {},
            intervalMs: 0,
            resolveHostnames,
            sweepSubnet: async () => 0,
        })

        // Force readNeighborTable to return a hostnamed ARP entry.
        const stub = vi
            .spyOn(discoverer as unknown as { readNeighborTable: () => Promise<unknown[]> }, 'readNeighborTable')
            .mockResolvedValue([{ ip: '192.168.1.42', mac: 'a4:b1:c2:11:22:33', hostname: 'living-room.local' }])

        await discoverer.discover()
        stub.mockRestore()

        const device = database.devices.get('A4B1C2112233')
        expect(device?.hostname).toBe('living-room.local')
        // No reverse-DNS needed since ARP already gave us a name.
        expect(resolveHostnames).not.toHaveBeenCalled()
    })

    it('falls back to reverse-DNS when ARP has no hostname', async () => {
        const database = makeDatabase()
        const resolveHostnames = vi.fn((ips: string[]) =>
            Promise.resolve(new Map(ips.map((ip) => [ip, `${ip.replace(/\./g, '-')}.local`]))),
        )
        const discoverer = new DeviceDiscoverer({
            database,
            eventBus: makeEventBus(),
            ouiMap: {},
            intervalMs: 0,
            resolveHostnames,
            sweepSubnet: async () => 0,
        })

        const stub = vi
            .spyOn(discoverer as unknown as { readNeighborTable: () => Promise<unknown[]> }, 'readNeighborTable')
            .mockResolvedValue([{ ip: '192.168.1.5', mac: 'a4:b1:c2:11:22:33', hostname: null }])

        await discoverer.discover()
        stub.mockRestore()

        expect(resolveHostnames).toHaveBeenCalledWith(['192.168.1.5'])
        const device = database.devices.get('A4B1C2112233')
        expect(device?.hostname).toBe('192-168-1-5.local')
    })

    it('preserves a previously-resolved hostname when nothing resolves this pass', async () => {
        const database = makeDatabase()
        // Seed a device that already has a hostname.
        database.devices.set('A4B1C2112233', {
            mac: 'A4B1C2112233',
            ip: '192.168.1.5',
            vendor: null,
            hostname: 'camera.local',
            customName: null,
            firstSeen: 1000,
            lastSeen: 1000,
            isIot: false,
            iotCategory: null,
        })

        const resolveHostnames = vi.fn(() => Promise.resolve(new Map<string, string>()))
        const discoverer = new DeviceDiscoverer({
            database,
            eventBus: makeEventBus(),
            ouiMap: {},
            intervalMs: 0,
            resolveHostnames,
            sweepSubnet: async () => 0,
        })

        const stub = vi
            .spyOn(discoverer as unknown as { readNeighborTable: () => Promise<unknown[]> }, 'readNeighborTable')
            .mockResolvedValue([{ ip: '192.168.1.5', mac: 'a4:b1:c2:11:22:33', hostname: null }])

        await discoverer.discover()
        stub.mockRestore()

        const device = database.devices.get('A4B1C2112233')
        // Existing hostname carried over — not wiped to null.
        expect(device?.hostname).toBe('camera.local')
    })
})

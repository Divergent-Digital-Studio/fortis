import { normalizeMac } from '../datasets/oui-lookup'

export interface RawDevice {
    ip: string
    mac: string
}

export interface DeviceDiffResult {
    newDevices: RawDevice[]
    knownDevices: RawDevice[]
}

export function diffDevices(previousMacs: Set<string>, current: RawDevice[]): DeviceDiffResult {
    const normalizedPrevious = new Set<string>()
    for (const mac of previousMacs) {
        const normalized = normalizeMac(mac)
        if (normalized) normalizedPrevious.add(normalized)
    }

    const newDevices: RawDevice[] = []
    const knownDevices: RawDevice[] = []

    for (const device of current) {
        const normalized = normalizeMac(device.mac)
        if (normalized && normalizedPrevious.has(normalized)) {
            knownDevices.push(device)
        } else {
            newDevices.push(device)
        }
    }

    return { newDevices, knownDevices }
}

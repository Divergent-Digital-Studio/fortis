import type { IotDevice } from '@shared/types/m1'
import type { Alert } from '@shared/types/alert'
import type { NetworkConnection } from '@shared/types/connection'
import type { IDatabaseService } from './database'
import type { FortisEventBus } from './event-bus'
import type { GeoDatabase } from './datasets/geoip-lookup'
import { lookupLocation } from './datasets/geoip-lookup'
import { countryName } from './datasets/country-names'
import { isPrivateOrReservedIp } from './datasets/ip-uint'
import { detectNewCountryAnomaly } from './net/iot-anomaly'

interface IotMonitorDeps {
    database: IDatabaseService
    eventBus: FortisEventBus
    getConnections: () => NetworkConnection[]
    db: GeoDatabase
    onAlert?: (alert: Alert) => void
}

export class IotMonitor {
    private readonly database: IDatabaseService
    private readonly eventBus: FortisEventBus
    private readonly getConnections: () => NetworkConnection[]
    private readonly db: GeoDatabase
    private readonly onAlert: ((alert: Alert) => void) | null
    private current: IotDevice[] = []
    private networkBaseline = new Set<string>()

    constructor(deps: IotMonitorDeps) {
        this.database = deps.database
        this.eventBus = deps.eventBus
        this.getConnections = deps.getConnections
        this.db = deps.db
        this.onAlert = deps.onAlert ?? null
    }

    getCurrentIotDevices(): IotDevice[] {
        return this.current
    }

    update(): IotDevice[] {
        try {
            const codeToName = new Map<string, string>()

            for (const connection of this.getConnections()) {
                const ip = connection.remoteAddress
                if (ip.length === 0) continue
                if (isPrivateOrReservedIp(ip)) continue

                const location = lookupLocation(this.db, ip)
                if (location === null) continue

                codeToName.set(location.countryCode, countryName(location.countryCode))
            }

            const currentCountryCodes = Array.from(codeToName.keys())
            const sortedNames = Array.from(codeToName.values()).sort((a, b) => a.localeCompare(b))

            const detection = detectNewCountryAnomaly(this.networkBaseline, currentCountryCodes)
            for (const code of currentCountryCodes) {
                this.networkBaseline.add(code)
            }

            const newCountryNames = detection.newCountries.map((code) => codeToName.get(code) ?? code)
            const anomalyReason = detection.isAnomaly
                ? `New destination country: ${newCountryNames.join(', ')}`
                : null

            const iotDevices = this.database.getWifiDevices().filter((device) => device.isIot)
            const result: IotDevice[] = iotDevices.map((device) => ({
                mac: device.mac,
                ip: device.ip,
                vendor: device.vendor,
                name: device.customName ?? device.hostname ?? device.vendor ?? 'Unknown device',
                category: device.iotCategory ?? 'unknown',
                firstSeen: device.firstSeen,
                lastSeen: device.lastSeen,
                destinations: sortedNames,
                hasAnomaly: detection.isAnomaly,
                anomalyReason,
            }))

            if (detection.isAnomaly && this.onAlert && result.length > 0) {
                this.raiseAnomalyAlert(anomalyReason ?? '', detection.newCountries.join(','), Date.now())
            }

            this.current = result
            this.eventBus.emit('iot:updated', { devices: this.current })
            return this.current
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[IotMonitor] Update failed: ${reason}`)
            return this.current
        }
    }

    private raiseAnomalyAlert(description: string, newCountriesKey: string, now: number): void {
        const title = 'IoT network anomaly'
        const connectionId = 'iot:network'
        const recommendation = 'An IoT device on your network is reaching a new country. Verify this is expected.'
        const dedupKey = `iot:network:${newCountriesKey}`

        const alertId = this.database.saveAlert({
            timestamp: now,
            type: 'system',
            threatLevel: 'warning',
            title,
            description,
            connectionId,
            recommendation,
            source: 'system',
            dedupKey,
        })

        if (this.onAlert) {
            this.onAlert({
                id: alertId,
                timestamp: now,
                type: 'system',
                threatLevel: 'warning',
                title,
                description,
                connectionId,
                recommendation,
                source: 'system',
                acknowledged: false,
                whitelisted: false,
                dedupKey,
                suppressedCount: 0,
                createdAt: now,
            })
        }

        this.eventBus.emit('alert:iot-anomaly', { mac: 'network' })
    }
}

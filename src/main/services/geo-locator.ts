import type { GeoConnection } from '@shared/types/m1'
import type { NetworkConnection } from '@shared/types/connection'
import type { FortisEventBus } from './event-bus'
import type { GeoDatabase } from './datasets/geoip-lookup'
import { lookupLocation } from './datasets/geoip-lookup'
import { isPrivateOrReservedIp } from './datasets/ip-uint'
import { countryName } from './datasets/country-names'

interface GeoLocatorDeps {
    eventBus: FortisEventBus
    getConnections: () => NetworkConnection[]
    db: GeoDatabase
}

export class GeoLocator {
    private readonly eventBus: FortisEventBus
    private readonly getConnections: () => NetworkConnection[]
    private readonly db: GeoDatabase
    private current: GeoConnection[] = []

    constructor(deps: GeoLocatorDeps) {
        this.eventBus = deps.eventBus
        this.getConnections = deps.getConnections
        this.db = deps.db
    }

    getCurrentGeoConnections(): GeoConnection[] {
        return this.current
    }

    update(): GeoConnection[] {
        try {
            const connections = this.getConnections()
            const counts = new Map<string, number>()

            for (const connection of connections) {
                const ip = connection.remoteAddress
                if (ip.length === 0) continue
                if (isPrivateOrReservedIp(ip)) continue
                counts.set(ip, (counts.get(ip) ?? 0) + 1)
            }

            const result: GeoConnection[] = []

            for (const [ip, connectionCount] of counts) {
                const location = lookupLocation(this.db, ip)

                /* An address we cannot place still belongs in the list and the table;
                   the map simply has nowhere to draw it. */
                result.push({
                    remoteAddress: ip,
                    countryCode: location?.countryCode ?? null,
                    countryName: location ? countryName(location.countryCode) : null,
                    city: location?.city !== '' ? (location?.city ?? null) : null,
                    latitude: location?.lat ?? null,
                    longitude: location?.lon ?? null,
                    connectionCount,
                })
            }

            this.current = result
            this.eventBus.emit('geo:updated', { connections: this.current })
            return this.current
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[GeoLocator] Update failed: ${reason}`)
            return this.current
        }
    }
}

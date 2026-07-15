import { ipv4ToUint, ipv6ToPrefix, unwrapIpv4Mapped } from './ip-uint'

export interface GeoLocation {
    lat: number
    lon: number
    countryCode: string
    city: string
}

/*
 * Ranges are stored as parallel typed arrays. Each `starts` array is ascending and
 * covers its whole key space without gaps, so range i spans [starts[i], starts[i+1]-1].
 * IPv6 keys are the top 64 bits of the address. Index 0 of the location table is the
 * reserved/private sentinel and never geolocates.
 */
export interface GeoDatabase {
    v4Starts: Uint32Array
    v4LocIndex: Uint32Array
    v6Starts: BigUint64Array
    v6LocIndex: Uint32Array
    locations: GeoLocation[]
}

export const RESERVED_LOCATION = 0

export const EMPTY_GEO_DATABASE: GeoDatabase = {
    v4Starts: new Uint32Array(0),
    v4LocIndex: new Uint32Array(0),
    v6Starts: new BigUint64Array(0),
    v6LocIndex: new Uint32Array(0),
    locations: [],
}

/* Rightmost binary search: index of the last range whose start is <= key. */
function findRange(
    starts: Uint32Array | BigUint64Array,
    key: number | bigint,
): number {
    if (starts.length === 0) return -1
    if (key < starts[0]!) return -1

    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1
        if (starts[mid]! <= key) lo = mid
        else hi = mid - 1
    }
    return lo
}

function resolve(
    db: GeoDatabase,
    locIndex: Uint32Array,
    range: number,
): GeoLocation | null {
    if (range < 0) return null
    const location = locIndex[range]!
    if (location === RESERVED_LOCATION) return null
    return db.locations[location] ?? null
}

export function lookupLocation(db: GeoDatabase, ip: string): GeoLocation | null {
    const address = unwrapIpv4Mapped(ip)

    if (address.includes(':')) {
        const prefix = ipv6ToPrefix(address)
        if (prefix === null) return null
        return resolve(db, db.v6LocIndex, findRange(db.v6Starts, prefix))
    }

    const value = ipv4ToUint(address)
    if (value === null) return null
    return resolve(db, db.v4LocIndex, findRange(db.v4Starts, value))
}

import { readFileSync } from 'node:fs'
import { EMPTY_GEO_DATABASE, type GeoDatabase, type GeoLocation } from './geoip-lookup'

const MAGIC = 0x50494746
const VERSION = 2
const HEADER_BYTES = 24

type RawLocation = [number, number, string, string]

function parseLocations(raw: unknown): GeoLocation[] | null {
    if (!Array.isArray(raw)) return null
    const locations: GeoLocation[] = []
    for (const entry of raw as RawLocation[]) {
        if (!Array.isArray(entry) || entry.length < 4) return null
        const [lat, lon, countryCode, city] = entry
        if (typeof lat !== 'number' || typeof lon !== 'number') return null
        if (typeof countryCode !== 'string' || typeof city !== 'string') return null
        locations.push({ lat, lon, countryCode, city })
    }
    return locations
}

function fail(reason: string): { db: GeoDatabase; available: false } {
    console.warn(`[Datasets] ${reason}, degrading to empty`)
    return { db: EMPTY_GEO_DATABASE, available: false }
}

export function loadGeoip(
    binPath: string,
    metaPath: string,
): { db: GeoDatabase; available: boolean } {
    try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
            version?: number
            locations?: unknown
        }
        const locations = parseLocations(meta.locations)
        if (meta.version !== VERSION || locations === null) {
            return fail('GeoIP meta has unexpected shape')
        }

        const buffer = readFileSync(binPath)
        if (buffer.byteLength < HEADER_BYTES) return fail('GeoIP binary truncated')

        if (buffer.readUInt32LE(0) !== MAGIC || buffer.readUInt32LE(4) !== VERSION) {
            return fail('GeoIP binary has bad magic or version')
        }

        const v4Count = buffer.readUInt32LE(8)
        const v6Count = buffer.readUInt32LE(12)
        const locCount = buffer.readUInt32LE(16)

        if (locCount !== locations.length) {
            return fail('GeoIP binary and meta disagree on location count')
        }

        const expected = HEADER_BYTES + v4Count * 8 + v6Count * 12
        if (buffer.byteLength < expected) {
            return fail('GeoIP binary shorter than its header claims')
        }

        /* Copy rather than view: readFileSync may return a pooled Buffer whose byteOffset
           is not 4- or 8-byte aligned, which the typed array constructors reject. */
        const v4Starts = new Uint32Array(v4Count)
        const v4LocIndex = new Uint32Array(v4Count)
        const v6Starts = new BigUint64Array(v6Count)
        const v6LocIndex = new Uint32Array(v6Count)

        let offset = HEADER_BYTES
        Buffer.from(v4Starts.buffer).set(buffer.subarray(offset, (offset += v4Count * 4)))
        Buffer.from(v4LocIndex.buffer).set(buffer.subarray(offset, (offset += v4Count * 4)))
        Buffer.from(v6Starts.buffer).set(buffer.subarray(offset, (offset += v6Count * 8)))
        Buffer.from(v6LocIndex.buffer).set(buffer.subarray(offset, offset + v6Count * 4))

        return { db: { v4Starts, v4LocIndex, v6Starts, v6LocIndex, locations }, available: true }
    } catch (err) {
        console.warn(`[Datasets] failed to load GeoIP from ${binPath} / ${metaPath}:`, err)
        return { db: EMPTY_GEO_DATABASE, available: false }
    }
}

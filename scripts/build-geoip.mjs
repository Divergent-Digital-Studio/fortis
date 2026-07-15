import { createReadStream, createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Builds the GeoIP city dataset from DB-IP's free "city lite" CSV.
 * Source: https://db-ip.com/db/download/ip-to-city-lite (CC-BY-4.0)
 *
 * Output is binary because the source has ~7M ranges after merging; as JSON objects
 * that would be hundreds of MB on disk and far worse in RAM.
 *
 * ip-city.bin layout (little-endian):
 *   magic      u32  'FGIP' -> 0x50494746
 *   version    u32  2
 *   v4Count    u32  n4
 *   v6Count    u32  n6
 *   locCount   u32  m
 *   padding    u32  (keeps the u64 section 8-byte aligned)
 *   v4Starts   u32 * n4   ascending, gapless over IPv4
 *   v4LocIndex u32 * n4
 *   v6Starts   u64 * n6   ascending, gapless over the top 64 bits of IPv6
 *   v6LocIndex u32 * n6
 *
 * ip-city.meta.json holds the location table: [lat, lon, countryCode, city][]
 *
 * Location 0 is the reserved sentinel. DB-IP marks private/reserved blocks
 * (10/8, 127/8, fe80::/10, ...) as country "ZZ"; keeping them as the sentinel is what
 * makes coverage gapless, which is what lets us drop the `ends` arrays. Lookup
 * treats index 0 as "not geolocatable".
 *
 * IPv6 keys are the top 64 bits. DB-IP allocates at /64 or coarser: only 462 of its
 * 4.39M v6 ranges (0.01%) subdivide further, and a full 128-bit key would double the
 * section for that. Overlapping /64s keep the first location that claimed them.
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const outDir = join(repoRoot, 'resources', 'datasets')
const binPath = join(outDir, 'ip-city.bin')
const metaPath = join(outDir, 'ip-city.meta.json')

const MAGIC = 0x50494746
const VERSION = 2
const HEADER_BYTES = 24
const COORD_PRECISION = 1
const IPV4_MAX = 4294967295n
const IPV6_PREFIX_MAX = (1n << 64n) - 1n

function sourceUrl() {
    if (process.env.FORTIS_GEOIP_URL) return process.env.FORTIS_GEOIP_URL
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    return `https://download.db-ip.com/free/dbip-city-lite-${year}-${month}.csv.gz`
}

function ipv4ToUint(ip) {
    const parts = ip.split('.')
    if (parts.length !== 4) return null
    let value = 0
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null
        const n = Number(part)
        if (n > 255) return null
        value = value * 256 + n
    }
    return BigInt(value >>> 0)
}

/* Top 64 bits of an IPv6 literal, as a bigint. */
function ipv6ToPrefix(ip) {
    const halves = ip.split('::')
    if (halves.length > 2) return null

    const parse = (part) => {
        if (part === '') return []
        const groups = part.split(':')
        for (const group of groups) {
            if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
        }
        return groups
    }

    const head = parse(halves[0] ?? '')
    const tail = halves.length === 2 ? parse(halves[1] ?? '') : []
    if (head === null || tail === null) return null

    let groups
    if (halves.length === 2) {
        const fill = 8 - head.length - tail.length
        if (fill < 1) return null
        groups = [...head, ...Array(fill).fill('0'), ...tail]
    } else {
        groups = head
    }
    if (groups.length !== 8) return null

    let value = 0n
    for (let i = 0; i < 4; i += 1) {
        value = (value << 16n) | BigInt(parseInt(groups[i], 16))
    }
    return value
}

/* Fields may be quoted and contain commas (e.g. "New South Wales"). */
function parseCsvLine(line) {
    const fields = []
    let current = ''
    let quoted = false
    for (const ch of line) {
        if (ch === '"') quoted = !quoted
        else if (ch === ',' && !quoted) {
            fields.push(current)
            current = ''
        } else current += ch
    }
    fields.push(current)
    return fields
}

async function openSource() {
    const url = sourceUrl()
    if (url.startsWith('file:') || url.startsWith('/')) {
        const path = url.startsWith('file:') ? fileURLToPath(url) : url
        return createReadStream(path).pipe(createGunzip())
    }
    console.log(`[BuildGeoip] downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
    }
    return Readable.fromWeb(response.body).pipe(createGunzip())
}

/*
 * Accumulates ascending, gapless ranges, collapsing runs that share a location.
 * `ArrayType` is Uint32Array for IPv4 and BigUint64Array for IPv6.
 */
class RangeBuilder {
    constructor(label, ArrayType, maxKey) {
        this.label = label
        this.ArrayType = ArrayType
        this.maxKey = maxKey
        this.capacity = 1 << 20
        this.starts = new ArrayType(this.capacity)
        this.locIdx = new Uint32Array(this.capacity)
        this.count = 0
        this.previousEnd = null
    }

    add(start, end, location) {
        /*
         * Truncating IPv6 to /64 makes subdivided source ranges share a key, so a range
         * can start at or inside the previous one. The first location to claim a /64 wins;
         * later overlapping ranges only extend coverage.
         */
        if (this.previousEnd !== null && start <= this.previousEnd) {
            if (end > this.previousEnd) this.previousEnd = end
            return
        }
        if (this.previousEnd !== null && start !== this.previousEnd + 1n) {
            throw new Error(
                `${this.label}: gap in coverage before ${start} (previous end ${this.previousEnd}). ` +
                    `The binary format derives end from the next start and cannot represent gaps.`,
            )
        }
        this.previousEnd = end

        if (this.count > 0 && this.locIdx[this.count - 1] === location) return

        if (this.count === this.capacity) {
            this.capacity *= 2
            const starts = new this.ArrayType(this.capacity)
            const locIdx = new Uint32Array(this.capacity)
            starts.set(this.starts)
            locIdx.set(this.locIdx)
            this.starts = starts
            this.locIdx = locIdx
        }

        this.starts[this.count] = this.ArrayType === Uint32Array ? Number(start) : start
        this.locIdx[this.count] = location
        this.count += 1
    }

    verify() {
        if (this.count === 0) throw new Error(`${this.label}: no ranges parsed`)
        const first = this.ArrayType === Uint32Array ? BigInt(this.starts[0]) : this.starts[0]
        if (first !== 0n) throw new Error(`${this.label}: must start at 0, got ${first}`)
        if (this.previousEnd !== this.maxKey) {
            throw new Error(`${this.label}: coverage must end at ${this.maxKey}, got ${this.previousEnd}`)
        }
    }

    buffers() {
        const bytesPerKey = this.ArrayType === Uint32Array ? 4 : 8
        return [
            Buffer.from(this.starts.buffer, 0, this.count * bytesPerKey),
            Buffer.from(this.locIdx.buffer, 0, this.count * 4),
        ]
    }
}

async function main() {
    const stream = await openSource()
    const lines = createInterface({ input: stream, crlfDelay: Infinity })

    const locationIndex = new Map()
    const locations = [[0, 0, 'ZZ', '']]
    const RESERVED = 0

    const v4 = new RangeBuilder('ipv4', Uint32Array, IPV4_MAX)
    const v6 = new RangeBuilder('ipv6', BigUint64Array, IPV6_PREFIX_MAX)

    let reserved = 0
    let malformed = 0

    for await (const line of lines) {
        if (line === '') continue
        const fields = parseCsvLine(line)
        if (fields.length < 8) {
            malformed += 1
            continue
        }

        const isV6 = fields[0].includes(':')
        const start = isV6 ? ipv6ToPrefix(fields[0]) : ipv4ToUint(fields[0])
        const end = isV6 ? ipv6ToPrefix(fields[1]) : ipv4ToUint(fields[1])
        if (start === null || end === null || start > end) {
            malformed += 1
            continue
        }

        const countryCode = fields[3].trim().toUpperCase()
        const city = fields[5].trim()
        const lat = Number(fields[fields.length - 2])
        const lon = Number(fields[fields.length - 1])

        const geolocatable =
            countryCode.length === 2 &&
            countryCode !== 'ZZ' &&
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            lat >= -90 &&
            lat <= 90 &&
            lon >= -180 &&
            lon <= 180

        let location = RESERVED
        if (geolocatable) {
            const roundedLat = Number(lat.toFixed(COORD_PRECISION))
            const roundedLon = Number(lon.toFixed(COORD_PRECISION))
            const key = `${roundedLat}|${roundedLon}|${countryCode}`
            location = locationIndex.get(key) ?? -1
            if (location === -1) {
                location = locations.length
                locationIndex.set(key, location)
                locations.push([roundedLat, roundedLon, countryCode, city])
            }
        } else {
            reserved += 1
        }

        ;(isV6 ? v6 : v4).add(start, end, location)
    }

    v4.verify()
    v6.verify()

    const header = Buffer.alloc(HEADER_BYTES)
    header.writeUInt32LE(MAGIC, 0)
    header.writeUInt32LE(VERSION, 4)
    header.writeUInt32LE(v4.count, 8)
    header.writeUInt32LE(v6.count, 12)
    header.writeUInt32LE(locations.length, 16)
    header.writeUInt32LE(0, 20)

    mkdirSync(outDir, { recursive: true })
    const [v4Starts, v4Loc] = v4.buffers()
    const [v6Starts, v6Loc] = v6.buffers()
    await pipeline(
        Readable.from([header, v4Starts, v4Loc, v6Starts, v6Loc]),
        createWriteStream(binPath),
    )

    writeFileSync(metaPath, JSON.stringify({ version: VERSION, locations }))

    const bytes = HEADER_BYTES + v4.count * 8 + v6.count * 12
    console.log(
        `[BuildGeoip] ${v4.count} v4 ranges, ${v6.count} v6 ranges, ` +
            `${locations.length} locations, ${reserved} reserved, ${malformed} malformed ` +
            `-> ${(bytes / 1048576).toFixed(1)} MB bin`,
    )
}

await main()

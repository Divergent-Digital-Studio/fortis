import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadGeoip } from './load-geoip'
import { lookupLocation } from './geoip-lookup'

const binPath = resolve(__dirname, '../../../../resources/datasets/ip-city.bin')
const metaPath = resolve(__dirname, '../../../../resources/datasets/ip-city.meta.json')

/* The dataset is a build artifact (npm run build:datasets), so skip when absent. */
const shipped = existsSync(binPath) && existsSync(metaPath)
const maybe = shipped ? describe : describe.skip

maybe('loadGeoip against the shipped dataset', () => {
    const { db, available } = loadGeoip(binPath, metaPath)

    it('loads and reports availability', () => {
        expect(available).toBe(true)
        expect(db.v4Starts.length).toBe(db.v4LocIndex.length)
        expect(db.v6Starts.length).toBe(db.v6LocIndex.length)
        expect(db.v4Starts.length).toBeGreaterThan(0)
        expect(db.v6Starts.length).toBeGreaterThan(0)
        expect(db.locations.length).toBeGreaterThan(0)
    })

    it('covers both key spaces starting at zero', () => {
        expect(db.v4Starts[0]).toBe(0)
        expect(db.v6Starts[0]).toBe(0n)
    })

    it('keeps range starts strictly ascending', () => {
        /* One assertion each: millions of expect() calls would exceed the timeout. */
        let v4Break = -1
        for (let i = 1; i < db.v4Starts.length; i += 1) {
            if (db.v4Starts[i]! <= db.v4Starts[i - 1]!) {
                v4Break = i
                break
            }
        }
        let v6Break = -1
        for (let i = 1; i < db.v6Starts.length; i += 1) {
            if (db.v6Starts[i]! <= db.v6Starts[i - 1]!) {
                v6Break = i
                break
            }
        }
        expect({ v4Break, v6Break }).toEqual({ v4Break: -1, v6Break: -1 })
    })

    it('resolves public IPv4 to a country and city', () => {
        expect(lookupLocation(db, '8.8.8.8')?.countryCode).toBe('US')
        const sydney = lookupLocation(db, '54.79.215.244')
        expect(sydney?.countryCode).toBe('AU')
        expect(sydney?.city.length).toBeGreaterThan(0)
    })

    it('resolves public IPv6 to a country and city', () => {
        /* DB-IP places this Google anycast /64 in Montreal, not the US. */
        const google = lookupLocation(db, '2001:4860:4802:32::15')
        expect(google?.countryCode).toBe('CA')
        expect(google?.city).toBe('Montreal')

        for (const ip of ['2606:4700:20::681a:1', '2a02:6b8::1:119', '2600:1901:0:3084::1']) {
            expect(lookupLocation(db, ip)?.countryCode).toMatch(/^[A-Z]{2}$/)
        }
    })

    it('resolves every address in a /64 to the same location', () => {
        expect(lookupLocation(db, '2606:4700:20::1')).toBe(
            lookupLocation(db, '2606:4700:20::dead:beef'),
        )
    })

    it('does not geolocate private or reserved IPv4', () => {
        expect(lookupLocation(db, '10.0.0.1')).toBeNull()
        expect(lookupLocation(db, '127.0.0.1')).toBeNull()
        expect(lookupLocation(db, '192.168.1.1')).toBeNull()
    })

    it('does not geolocate reserved IPv6', () => {
        expect(lookupLocation(db, '::1')).toBeNull()
        expect(lookupLocation(db, 'fe80::1cd7:3adf:2a2:a36d')).toBeNull()
        expect(lookupLocation(db, 'fd00::1')).toBeNull()
    })

    it('degrades to empty when the files are missing', () => {
        const missing = loadGeoip('/nonexistent.bin', '/nonexistent.json')
        expect(missing.available).toBe(false)
        expect(missing.db.v4Starts.length).toBe(0)
        expect(lookupLocation(missing.db, '8.8.8.8')).toBeNull()
    })
})

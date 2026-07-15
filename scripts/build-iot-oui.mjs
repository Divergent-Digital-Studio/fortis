#!/usr/bin/env node
/**
 * Builds the OUI dataset used to name devices and classify them as IoT.
 *
 * Downloads the public IEEE list and keeps every registered vendor (~37k
 * entries, ~1.3MB). An earlier version filtered down to a curated set of
 * "IoT-looking" brands, which meant any vendor not on the list resolved to
 * null — and a device with no vendor can never be classified.
 *
 * Usage: node scripts/build-iot-oui.mjs && node scripts/build-oui-map.mjs
 * Requires network access to standards-oui.ieee.org.
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const IEEE_OUI_URL = 'https://standards-oui.ieee.org/oui/oui.txt'

function downloadOui() {
    // Lazy dynamic import keeps the script self-contained without a dep.
    return import('node:https').then((https) => {
        return new Promise((resolve, reject) => {
            const req = https.get(IEEE_OUI_URL, { timeout: 30000 }, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    // Follow redirect (IEEE sometimes 302s).
                    https.get(res.headers.location, { timeout: 30000 }, (r2) => {
                        const chunks = []
                        r2.on('data', (c) => chunks.push(c))
                        r2.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
                        r2.on('error', reject)
                    }).on('error', reject)
                    return
                }
                const chunks = []
                res.on('data', (c) => chunks.push(c))
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
                res.on('error', reject)
            })
            req.on('error', reject)
            req.on('timeout', () => req.destroy(new Error('IEEE OUI download timed out')))
        })
    })
}

/** Parse the IEEE oui.txt into [{ prefix, vendor }] pairs. */
function parseIeee(text) {
    const entries = []
    const lines = text.split(/\r?\n/)
    // Format: "AABBCC   (base 16)\t\tVendor Name"
    const re = /^([0-9A-F]{6})\s+\(base 16\)\s+(.+)$/
    for (const line of lines) {
        const m = line.match(re)
        if (!m) continue
        const prefix = m[1].toUpperCase()
        const vendor = m[2].trim()
        if (vendor) entries.push({ prefix, vendor })
    }
    return entries
}

/**
 * Every registered vendor is kept. The old curated allow-list silently dropped
 * whatever it hadn't heard of — Apple, Tuya and Murata among them — which left
 * real devices with no vendor and therefore no IoT classification. The full
 * list costs ~1.3MB and removes a whole class of "unknown device" bugs.
 */
function isRelevant() {
    return true
}

function readExistingCsv(outPath) {
    /** Load the current oui-source.csv so we preserve hand-curated non-IoT
     * vendors (Apple, Dell, Intel, Cisco, VMware, QEMU...) that are still useful
     * for showing device names even though they aren't IoT. Returns a Map. */
    const map = new Map()
    let text
    try {
        text = readFileSync(outPath, 'utf8')
    } catch {
        return map
    }
    for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (trimmed === '') continue
        const comma = trimmed.indexOf(',')
        if (comma === -1) continue
        const prefix = trimmed.slice(0, comma).trim().toUpperCase()
        const vendor = trimmed.slice(comma + 1).trim()
        if (/^[0-9A-F]{6}$/.test(prefix) && vendor) map.set(prefix, vendor)
    }
    return map
}

async function main() {
    console.log('Downloading IEEE OUI database...')
    const raw = await downloadOui()
    const all = parseIeee(raw)
    console.log(`Parsed ${all.length} OUI entries from IEEE.`)

    const outPath = join(here, 'data', 'oui-source.csv')

    // Start from the existing curated CSV (keeps non-IoT vendors), then merge in
    // all IoT/consumer matches from the IEEE database.
    const merged = readExistingCsv(outPath)
    const existingCount = merged.size

    for (const entry of all) {
        if (isRelevant(entry.vendor)) {
            merged.set(entry.prefix, entry.vendor)
        }
    }
    console.log(`Existing: ${existingCount}, after merge: ${merged.size}.`)

    // Stable order for reproducible builds.
    const sorted = Array.from(merged.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    const csv = sorted.map(([prefix, vendor]) => `${prefix},${vendor}`).join('\n') + '\n'
    writeFileSync(outPath, csv, 'utf8')
    console.log(`Wrote ${sorted.length} entries to ${outPath}`)
}

main().catch((err) => {
    console.error('Failed to build OUI dataset:', err)
    process.exit(1)
})

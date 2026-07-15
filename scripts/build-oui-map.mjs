import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const sourcePath = join(here, 'data', 'oui-source.csv')
const outDir = join(repoRoot, 'resources', 'datasets')
const outPath = join(outDir, 'oui-map.json')

function parseSource(text) {
    const map = {}
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim()
        if (line === '') continue
        const comma = line.indexOf(',')
        if (comma === -1) {
            console.warn(`[BuildOui] line ${i + 1} missing comma, skipping: ${line}`)
            continue
        }
        const prefix = line.slice(0, comma).trim().toUpperCase()
        const vendor = line.slice(comma + 1).trim()
        if (!/^[0-9A-F]{6}$/.test(prefix)) {
            console.warn(`[BuildOui] line ${i + 1} invalid prefix, skipping: ${prefix}`)
            continue
        }
        if (vendor === '') {
            console.warn(`[BuildOui] line ${i + 1} empty vendor, skipping: ${prefix}`)
            continue
        }
        map[prefix] = vendor
    }
    return map
}

function main() {
    const text = readFileSync(sourcePath, 'utf8')
    const map = parseSource(text)
    const sorted = {}
    for (const key of Object.keys(map).sort()) {
        sorted[key] = map[key]
    }
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outPath, JSON.stringify(sorted))
    console.log(`[BuildOui] wrote ${Object.keys(sorted).length} entries to ${outPath}`)
}

main()

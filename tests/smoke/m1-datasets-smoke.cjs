const { app } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const esbuild = require('esbuild')

const SRC_MAIN = path.resolve(__dirname, '../../src/main')
const SRC_SHARED = path.resolve(__dirname, '../../src/shared')
const REPO_ROOT = path.resolve(__dirname, '../..')

function resolveAlias(request, parentPath) {
    if (request.startsWith('@shared/')) {
        return path.join(SRC_SHARED, request.slice('@shared/'.length))
    }
    if (request.startsWith('@main/')) {
        return path.join(SRC_MAIN, request.slice('@main/'.length))
    }
    if (request.startsWith('.')) {
        return path.resolve(path.dirname(parentPath), request)
    }
    return null
}

function withTsExtension(base) {
    const candidates = [base, `${base}.ts`, path.join(base, 'index.ts')]
    for (const candidate of candidates) {
        if (candidate.endsWith('.ts') && fs.existsSync(candidate)) return candidate
    }
    return null
}

const originalResolve = Module._resolveFilename
Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
    const aliased = resolveAlias(request, parent && parent.filename ? parent.filename : process.cwd())
    if (aliased) {
        const resolved = withTsExtension(aliased)
        if (resolved) return resolved
    }
    return originalResolve.call(this, request, parent, isMain, options)
}

Module._extensions['.ts'] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const result = esbuild.transformSync(source, {
        loader: 'ts',
        format: 'cjs',
        target: 'node20',
        sourcefile: filename,
    })
    module._compile(result.code, filename)
}

const { resolveDatasetPath } = require(path.join(SRC_MAIN, 'services/datasets/resource-path.ts'))
const { loadOuiMap } = require(path.join(SRC_MAIN, 'services/datasets/load-oui.ts'))
const { loadGeoip } = require(path.join(SRC_MAIN, 'services/datasets/load-geoip.ts'))
const { lookupVendor } = require(path.join(SRC_MAIN, 'services/datasets/oui-lookup.ts'))
const { lookupLocation } = require(path.join(SRC_MAIN, 'services/datasets/geoip-lookup.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function scenarioOui() {
    const ouiPath = resolveDatasetPath(undefined, REPO_ROOT, 'oui-map.json')
    const { map, available } = loadOuiMap(ouiPath)
    check('OUI map loads and is available', available)
    check('OUI map has entries', Object.keys(map).length > 0)
    check(
        'known MAC 24:62:AB:11:22:33 resolves to Espressif',
        lookupVendor(map, '24:62:AB:11:22:33') === 'Espressif Inc.',
    )
    check(
        'known MAC B0:A7:37:00:00:00 resolves to Roku',
        lookupVendor(map, 'B0:A7:37:00:00:00') === 'Roku Inc.',
    )
}

function scenarioGeoip() {
    const binPath = resolveDatasetPath(undefined, REPO_ROOT, 'ip-city.bin')
    const metaPath = resolveDatasetPath(undefined, REPO_ROOT, 'ip-city.meta.json')
    const { db, available } = loadGeoip(binPath, metaPath)
    check('GeoIP loads and is available', available)
    check('GeoIP has v4+v6 ranges and locations',
        db.v4Starts.length > 0 && db.v6Starts.length > 0 && db.locations.length > 0)

    const google = lookupLocation(db, '8.8.8.8')
    check('8.8.8.8 resolves to US', google !== null && google.countryCode === 'US')

    const sydney = lookupLocation(db, '54.79.215.244')
    check('54.79.215.244 resolves to AU', sydney !== null && sydney.countryCode === 'AU')
    check('54.79.215.244 carries a city', sydney !== null && sydney.city.length > 0)

    const v6 = lookupLocation(db, '2606:4700:20::681a:1')
    check('IPv6 2606:4700:20:: resolves', v6 !== null && v6.countryCode.length === 2)

    check('private 10.0.0.1 does not geolocate', lookupLocation(db, '10.0.0.1') === null)
    check('loopback 127.0.0.1 does not geolocate', lookupLocation(db, '127.0.0.1') === null)
    check('link-local fe80:: does not geolocate', lookupLocation(db, 'fe80::1') === null)
}

app.whenReady().then(() => {
    let code = 0
    try {
        scenarioOui()
        scenarioGeoip()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

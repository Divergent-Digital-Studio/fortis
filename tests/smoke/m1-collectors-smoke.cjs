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
const { DeviceDiscoverer } = require(path.join(SRC_MAIN, 'services/device-discoverer.ts'))
const { DnsCollector } = require(path.join(SRC_MAIN, 'services/dns-collector.ts'))
const { VpnLeakDetector } = require(path.join(SRC_MAIN, 'services/vpn-leak-detector.ts'))
const { IotMonitor } = require(path.join(SRC_MAIN, 'services/iot-monitor.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function fakeDb() {
    const devices = new Map()
    const dnsQueries = new Map()
    const alerts = []
    return {
        getWifiDevices: () => Array.from(devices.values()),
        upsertWifiDevice: (d) => { devices.set(d.mac, d) },
        getDnsQueries: () => Array.from(dnsQueries.values()),
        upsertDnsQuery: (r) => { dnsQueries.set(`${r.domain}|${r.resolvedIp}`, r) },
        saveAlert: (input) => {
            const id = `alert-${alerts.length}`
            alerts.push({ id, ...input })
            return id
        },
        saveVpnStatus: () => {},
        getLatestVpnStatus: () => null,
        _alerts: alerts,
    }
}

function fakeBus() {
    return { emit: () => {}, on: () => {}, off: () => {} }
}

async function scenarioDiscoverer() {
    const ouiPath = resolveDatasetPath(undefined, REPO_ROOT, 'oui-map.json')
    const { map } = loadOuiMap(ouiPath)
    const db = fakeDb()

    const discoverer = new DeviceDiscoverer({ database: db, eventBus: fakeBus(), ouiMap: map })
    const devices = await discoverer.discover()

    check('discover() returns an array', Array.isArray(devices))
    check('discoverer health is ok or unsupported (not crashed)', ['ok', 'unsupported', 'degraded'].includes(discoverer.getHealth()))
    check('every device has a normalized 12-hex mac', devices.every((d) => /^[0-9A-F]{12}$/.test(d.mac)))
    check('every device has a numeric firstSeen/lastSeen', devices.every((d) => typeof d.firstSeen === 'number' && typeof d.lastSeen === 'number'))
}

async function scenarioDnsCollector() {
    const db = fakeDb()
    const collector = new DnsCollector({ database: db, eventBus: fakeBus(), getConnections: () => [] })
    const records = await collector.collect()

    check('dns collect() returns an array', Array.isArray(records))
    check('dns collector health is ok/degraded/unsupported (not crashed)', ['ok', 'unsupported', 'degraded'].includes(collector.getHealth()))
}

async function scenarioVpnLeakDetector() {
    const db = fakeDb()
    const detector = new VpnLeakDetector({ database: db, eventBus: fakeBus() })
    const status = await detector.evaluate()

    check('vpn evaluate() returns a status object', status && typeof status === 'object')
    check('vpn verdict is pass/warn/fail', ['pass', 'warn', 'fail'].includes(status.verdict))
    check('vpn detector health is ok/degraded/unsupported (not crashed)', ['ok', 'unsupported', 'degraded'].includes(detector.getHealth()))
}

async function scenarioIotMonitor() {
    const db = fakeDb()
    const monitor = new IotMonitor({
        database: db,
        eventBus: fakeBus(),
        getConnections: () => [],
        ranges: [],
        countries: [],
    })
    const devices = monitor.update()

    check('iot update() returns an array', Array.isArray(devices))
    check('iot getCurrentIotDevices() returns an array', Array.isArray(monitor.getCurrentIotDevices()))
}

app.whenReady().then(async () => {
    let code = 0
    try {
        await scenarioDiscoverer()
        await scenarioDnsCollector()
        await scenarioVpnLeakDetector()
        await scenarioIotMonitor()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

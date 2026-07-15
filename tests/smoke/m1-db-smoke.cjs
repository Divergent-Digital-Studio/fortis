const { app, safeStorage } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const Module = require('node:module')
const esbuild = require('esbuild')

const SRC_MAIN = path.resolve(__dirname, '../../src/main')
const SRC_SHARED = path.resolve(__dirname, '../../src/shared')

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

const { DatabaseService } = require(path.join(SRC_MAIN, 'services/database.ts'))
const { provisionDbKey, nodeFileStore } = require(path.join(SRC_MAIN, 'services/db-key.ts'))
const { computeM1RetentionCutoff } = require(path.join(SRC_MAIN, 'services/db/retention.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function makeDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function fileIsEncrypted(file) {
    const header = fs.readFileSync(file).subarray(0, 16).toString('latin1')
    return !header.startsWith('SQLite format 3')
}

const HOUR = 60 * 60 * 1000

function scenarioM1Persistence() {
    const dir = makeDir('fortis-m1-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })

    const db = new DatabaseService(dbPath, key)
    const now = Date.now()
    const old = now - 48 * HOUR
    const recent = now - 1 * HOUR

    db.upsertWifiDevice({ mac: 'AABBCC112233', ip: '192.168.1.2', vendor: 'Acme', hostname: null, firstSeen: old, lastSeen: old, isIot: false, iotCategory: null })
    db.upsertWifiDevice({ mac: 'DDEEFF445566', ip: '192.168.1.3', vendor: 'Nest', hostname: null, firstSeen: recent, lastSeen: recent, isIot: true, iotCategory: 'smart-home' })

    db.upsertDnsQuery({ id: 'd1', domain: 'old.example.com', resolvedIp: '1.2.3.4', source: 'cache', processName: null, firstSeen: old, lastSeen: old, hitCount: 1 })
    db.upsertDnsQuery({ id: 'd2', domain: 'new.example.com', resolvedIp: '5.6.7.8', source: 'ptr', processName: 'curl', firstSeen: recent, lastSeen: recent, hitCount: 1 })

    db.saveVpnStatus({ verdict: 'fail', tunnelActive: true, tunnelInterface: 'utun3', defaultRouteThroughTunnel: false, explanation: 'old leak', timestamp: old })
    db.saveVpnStatus({ verdict: 'pass', tunnelActive: true, tunnelInterface: 'utun3', defaultRouteThroughTunnel: true, explanation: 'recent ok', timestamp: recent })

    check('file is encrypted at rest', fileIsEncrypted(dbPath))
    check('wifi_devices round-trips two rows', db.getWifiDevices().length === 2)
    check('dns_queries round-trips two rows', db.getDnsQueries().length === 2)
    check('latest vpn status is the recent pass', (() => {
        const latest = db.getLatestVpnStatus()
        return latest !== null && latest.verdict === 'pass' && latest.timestamp === recent
    })())

    const cutoff = computeM1RetentionCutoff({ alertHistoryHours: 24 }, now)
    check('free-tier cutoff is now minus 24h', cutoff === now - 24 * HOUR)

    db.pruneM1History(cutoff)

    const devices = db.getWifiDevices()
    const dns = db.getDnsQueries()
    check('prune removed the old device', devices.length === 1 && devices[0].mac === 'DDEEFF445566')
    check('prune kept the recent device', devices.some((d) => d.mac === 'DDEEFF445566'))
    check('prune removed the old dns row', dns.length === 1 && dns[0].domain === 'new.example.com')
    check('prune kept recent vpn status (latest still pass)', (() => {
        const latest = db.getLatestVpnStatus()
        return latest !== null && latest.verdict === 'pass'
    })())

    const unlimitedCutoff = computeM1RetentionCutoff({ alertHistoryHours: null }, now)
    check('unlimited tier cutoff is null (no prune)', unlimitedCutoff === null)

    db.close()

    const reopened = new DatabaseService(dbPath, key)
    check('rows persist across encrypted reopen', reopened.getWifiDevices().length === 1 && reopened.getDnsQueries().length === 1)
    reopened.close()
}

app.whenReady().then(() => {
    let code = 0
    try {
        scenarioM1Persistence()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

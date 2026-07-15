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

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function makeDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

const HOUR = 60 * 60 * 1000

function defenseAction(over) {
    return {
        id: 'act-1',
        createdAt: Date.now(),
        kind: 'kill',
        status: 'pending',
        target: '4321',
        processName: 'suspicious',
        reason: 'unit smoke',
        ruleId: null,
        executedAt: null,
        error: null,
        ...over,
    }
}

function customRule(over) {
    return {
        id: 'rule-1',
        name: 'Block bad port',
        enabled: true,
        conditions: [{ field: 'remotePort', operator: 'equals', value: '6667' }],
        action: 'alert',
        threatLevel: 'warning',
        createdAt: Date.now(),
        ...over,
    }
}

function tlsCert(over) {
    const now = Date.now()
    return {
        hostPort: 'example.com:443',
        host: 'example.com',
        port: 443,
        issuer: 'Lets Encrypt',
        subject: 'example.com',
        validFrom: now - 30 * 24 * HOUR,
        validTo: now + 60 * 24 * HOUR,
        daysUntilExpiry: 60,
        selfSigned: false,
        status: 'valid',
        lastChecked: now,
        ...over,
    }
}

function scenarioDefenseDb() {
    const dir = makeDir('fortis-m3-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })

    const db = new DatabaseService(dbPath, key)
    const now = Date.now()

    db.insertDefenseAction(defenseAction())
    const fetched = db.getDefenseAction('act-1')
    check('defense action round-trips with pending status', !!fetched && fetched.status === 'pending')

    db.updateDefenseActionStatus('act-1', 'executed', now, null)
    const executed = db.getDefenseAction('act-1')
    check('defense action transitions to executed', !!executed && executed.status === 'executed' && executed.executedAt === now)

    db.insertBlockedIp({ ip: '9.9.9.9', blockedAt: now, reason: 'smoke', platform: 'linux', active: true })
    check('blocked ip appears in active list', db.getBlockedIps(true).length === 1)

    db.setBlockedIpInactive('9.9.9.9')
    check('blocked ip removed from active list after deactivation', db.getBlockedIps(true).length === 0)

    db.upsertCustomRule(customRule())
    check('custom rule round-trips', db.getCustomRules().some((r) => r.id === 'rule-1'))

    db.deleteCustomRule('rule-1')
    check('custom rule removed after delete', !db.getCustomRules().some((r) => r.id === 'rule-1'))

    db.upsertTlsCert(tlsCert())
    check('tls cert round-trips', db.getTlsCerts().some((c) => c.hostPort === 'example.com:443'))

    db.insertDefenseAction(defenseAction({ id: 'old-executed', createdAt: now - 48 * HOUR, status: 'executed', executedAt: now - 48 * HOUR }))
    db.insertDefenseAction(defenseAction({ id: 'still-pending', createdAt: now - 48 * HOUR, status: 'pending' }))
    db.pruneDefenseActions(now)
    const remaining = db.getDefenseActions()
    check('prune removes old non-pending action', !remaining.some((a) => a.id === 'old-executed'))
    check('prune keeps pending action', remaining.some((a) => a.id === 'still-pending'))

    db.close()
}

app.whenReady().then(() => {
    let code = 0
    try {
        scenarioDefenseDb()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

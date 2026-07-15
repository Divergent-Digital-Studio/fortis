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
const { provisionDbKey, nodeFileStore, dbKeyToPassphrase } = require(path.join(SRC_MAIN, 'services/db-key.ts'))
const { createBackup, restoreFromBackup } = require(path.join(SRC_MAIN, 'services/backup.ts'))
const RawDatabase = require('better-sqlite3-multiple-ciphers')

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function makeDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function fileIsPlaintextSqlite(file) {
    const header = fs.readFileSync(file).subarray(0, 16).toString('latin1')
    return header.startsWith('SQLite format 3')
}

function backupPath(dbPath, index) {
    const dir = path.dirname(dbPath)
    const suffix = index === 0 ? '' : `.${index}`
    return path.join(dir, `fortis-backup${suffix}.db`)
}

function openWithKey(file, passphrase) {
    const db = new RawDatabase(file)
    db.pragma("cipher='sqlcipher'")
    db.pragma(`key='${passphrase}'`)
    return db
}

function scenarioEncryptedRestorableBackup() {
    const dir = makeDir('fortis-backup-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })
    const passphrase = dbKeyToPassphrase(key)

    const db = new DatabaseService(dbPath, key)
    db.saveAlert({
        timestamp: Date.now(),
        type: 'system',
        threatLevel: 'info',
        title: 'backup-canary',
        description: 'backup-secret-payload',
        connectionId: 'conn-backup-1',
        recommendation: 'none',
    })

    const made = createBackup()
    check('createBackup() reports success', made === true)

    const bk = backupPath(dbPath, 0)
    check('backup file exists', fs.existsSync(bk))

    check('(a) backup file is NOT plaintext SQLite (header scrambled)', !fileIsPlaintextSqlite(bk))
    const rawBytes = fs.readFileSync(bk)
    check('(a) backup does not leak the secret payload in cleartext', !rawBytes.includes(Buffer.from('backup-secret-payload')))

    let opensWithKey = false
    let rowPresent = false
    try {
        const probe = openWithKey(bk, passphrase)
        const row = probe.prepare("SELECT title, description FROM alerts WHERE title = 'backup-canary'").get()
        rowPresent = !!row && row.description === 'backup-secret-payload'
        opensWithKey = true
        probe.close()
    } catch (err) {
        check(`backup open with key threw: ${err && err.message ? err.message : String(err)}`, false)
    }
    check('(b) backup opens with the correct key', opensWithKey)
    check('(b) the row is present inside the backup', rowPresent)

    let wrongKeyRejected = false
    try {
        const probe = openWithKey(bk, Buffer.alloc(32, 13).toString('hex'))
        probe.prepare('SELECT COUNT(*) AS c FROM alerts').get()
        probe.close()
    } catch {
        wrongKeyRejected = true
    }
    check('(c) a wrong key fails on the backup', wrongKeyRejected)

    db.close()

    fs.rmSync(dbPath, { force: true })
    fs.rmSync(`${dbPath}-wal`, { force: true })
    fs.rmSync(`${dbPath}-shm`, { force: true })

    const restored = restoreFromBackup(dbPath, passphrase)
    check('(d) restoreFromBackup() reports success', restored === true)
    check('(d) restored db file is encrypted', !fileIsPlaintextSqlite(dbPath))

    const reopened = new DatabaseService(dbPath, key)
    const alerts = reopened.getRecentAlerts(50)
    reopened.close()
    check(
        '(d) restore reproduces the data',
        alerts.some((a) => a.title === 'backup-canary' && a.description === 'backup-secret-payload'),
    )

    fs.rmSync(dir, { recursive: true, force: true })
}

app.whenReady().then(() => {
    let code = 0
    try {
        scenarioEncryptedRestorableBackup()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

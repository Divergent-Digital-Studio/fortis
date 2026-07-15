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
const RawDatabase = require('better-sqlite3-multiple-ciphers')

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

function scenarioFreshEncrypted() {
    const dir = makeDir('fortis-fresh-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })

    const db = new DatabaseService(dbPath, key)
    db.saveAlert({
        timestamp: Date.now(),
        type: 'system',
        threatLevel: 'info',
        title: 'canary-alert',
        description: 'smoke-test-canary',
        connectionId: 'conn-1',
        recommendation: 'none',
    })
    db.close()

    check('fresh db file is encrypted (no SQLite plaintext header)', fileIsEncrypted(dbPath))

    const rawBytes = fs.readFileSync(dbPath)
    check('canary string absent from raw encrypted bytes', !rawBytes.includes(Buffer.from('smoke-test-canary')))

    const reopened = new DatabaseService(dbPath, key)
    const alerts = reopened.getRecentAlerts(10)
    reopened.close()
    check('reopen with correct key reads the row back', alerts.length === 1 && alerts[0].title === 'canary-alert')

    fs.rmSync(dir, { recursive: true, force: true })
}

function scenarioWrongKeyFails() {
    const dir = makeDir('fortis-wrong-')
    const dbPath = path.join(dir, 'fortis.db')
    const goodKey = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })

    const db = new DatabaseService(dbPath, goodKey)
    db.saveAlert({
        timestamp: Date.now(),
        type: 'system',
        threatLevel: 'info',
        title: 'secret-alert',
        description: 'do-not-leak',
        connectionId: 'conn-2',
        recommendation: 'none',
    })
    db.close()

    let wrongKeyRejected = false
    try {
        const wrong = new RawDatabase(dbPath)
        wrong.pragma("cipher='sqlcipher'")
        wrong.pragma(`key='${Buffer.alloc(32, 9).toString('hex')}'`)
        wrong.prepare('SELECT COUNT(*) AS c FROM alerts').get()
        wrong.close()
    } catch {
        wrongKeyRejected = true
    }
    check('wrong key is rejected on read', wrongKeyRejected)

    let plainOpenFails = false
    try {
        const plain = new RawDatabase(dbPath)
        plain.prepare('SELECT COUNT(*) AS c FROM alerts').get()
        plain.close()
    } catch {
        plainOpenFails = true
    }
    check('plaintext open of encrypted db fails (SQLITE_NOTADB)', plainOpenFails)

    fs.rmSync(dir, { recursive: true, force: true })
}

function scenarioPlaintextMigration() {
    const dir = makeDir('fortis-migrate-')
    const dbPath = path.join(dir, 'fortis.db')

    const plain = new RawDatabase(dbPath)
    plain.pragma('journal_mode = WAL')
    plain.pragma('wal_autocheckpoint = 0')
    plain.exec(
        `CREATE TABLE alerts (
            id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, type TEXT NOT NULL,
            threat_level TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            connection_id TEXT NOT NULL DEFAULT '', recommendation TEXT NOT NULL DEFAULT '',
            acknowledged INTEGER NOT NULL DEFAULT 0, whitelisted INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0
        )`,
    )
    plain.pragma('wal_checkpoint(TRUNCATE)')
    plain.prepare(
        'INSERT INTO alerts (id, timestamp, type, threat_level, title) VALUES (?,?,?,?,?)',
    ).run('legacy-1', Date.now(), 'system', 'warning', 'pre-existing-plaintext-row')
    plain.prepare(
        'INSERT INTO alerts (id, timestamp, type, threat_level, title) VALUES (?,?,?,?,?)',
    ).run('wal-only-1', Date.now(), 'system', 'critical', 'wal-only-committed-row')

    const holdOpen = new RawDatabase(dbPath)
    holdOpen.prepare('SELECT COUNT(*) AS c FROM alerts').get()

    const crashDir = makeDir('fortis-migrate-crash-')
    const crashDbPath = path.join(crashDir, 'fortis.db')
    for (const [src, dst] of [
        [dbPath, crashDbPath],
        [`${dbPath}-wal`, `${crashDbPath}-wal`],
        [`${dbPath}-shm`, `${crashDbPath}-shm`],
    ]) {
        if (fs.existsSync(src)) fs.copyFileSync(src, dst)
    }
    holdOpen.close()
    plain.close()

    check(
        'crash-state copy has a non-empty -wal sidecar (committed rows not yet checkpointed)',
        fs.existsSync(`${crashDbPath}-wal`) && fs.statSync(`${crashDbPath}-wal`).size > 0,
    )
    check('crash-state copy main db is genuine plaintext SQLite', !fileIsEncrypted(crashDbPath))

    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir: crashDir })
    const migrated = new DatabaseService(crashDbPath, key)
    const titles = migrated.getRecentAlerts(50).map((a) => a.title)
    const survived = titles.includes('pre-existing-plaintext-row')
    const walSurvived = titles.includes('wal-only-committed-row')
    migrated.close()

    check('db file is encrypted after migration', fileIsEncrypted(crashDbPath))
    check('pre-existing plaintext row survived migration', survived)
    check('WAL-resident committed row survived migration (no WAL loss)', walSurvived)

    const reopened = new DatabaseService(crashDbPath, key)
    const reopenedTitles = reopened.getRecentAlerts(50).map((a) => a.title)
    const stillThere = reopenedTitles.includes('pre-existing-plaintext-row')
    const walStillThere = reopenedTitles.includes('wal-only-committed-row')
    reopened.close()
    check('migrated row readable on subsequent encrypted open', stillThere)
    check('WAL-resident row readable on subsequent encrypted open', walStillThere)

    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(crashDir, { recursive: true, force: true })
}

app.whenReady().then(() => {
    let code = 0
    try {
        scenarioFreshEncrypted()
        scenarioWrongKeyFails()
        scenarioPlaintextMigration()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

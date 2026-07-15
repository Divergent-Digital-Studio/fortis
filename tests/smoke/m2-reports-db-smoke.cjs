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
const { computeReportRetentionCutoff } = require(path.join(SRC_MAIN, 'services/db/retention.ts'))

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

function reportFixture(id, generatedAt) {
    return {
        id,
        generatedAt,
        periodStart: generatedAt - 7 * 24 * HOUR,
        periodEnd: generatedAt,
        summary: `report ${id}`,
        healthScore: 80,
        topProcesses: [{ name: 'chrome', count: 5 }],
        topDestinations: [{ address: '1.1.1.1', country: 'US', count: 5 }],
        threatCount: 1,
        newDeviceCount: 2,
        generatedBy: 'local',
    }
}

function scenarioReports() {
    const dir = makeDir('fortis-m2-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })

    const db = new DatabaseService(dbPath, key)
    const now = Date.now()
    const old = now - 48 * HOUR
    const recent = now - 1 * HOUR

    db.insertReport(reportFixture('old', old))
    db.insertReport(reportFixture('recent', recent))

    check('file is encrypted at rest', fileIsEncrypted(dbPath))

    const all = db.getReports()
    check('reports round-trip two rows newest-first', all.length === 2 && all[0].id === 'recent')
    check('JSON arrays parse back', Array.isArray(all[0].topProcesses) && all[0].topProcesses[0].name === 'chrome')
    check('latest report is the recent one', db.getLatestReport()?.id === 'recent')

    const cutoff = computeReportRetentionCutoff({ alertHistoryHours: 24 }, now)
    check('free-tier cutoff is now minus 24h', cutoff === now - 24 * HOUR)

    db.pruneReports(cutoff)
    const afterPrune = db.getReports()
    check('prune removed the old report', afterPrune.length === 1 && afterPrune[0].id === 'recent')

    const unlimited = computeReportRetentionCutoff({ alertHistoryHours: null }, now)
    check('unlimited tier cutoff is null', unlimited === null)

    db.close()

    const reopened = new DatabaseService(dbPath, key)
    check('report persists across encrypted reopen', reopened.getReports().length === 1)
    reopened.close()
}

app.whenReady().then(() => {
    let code = 0
    try {
        scenarioReports()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

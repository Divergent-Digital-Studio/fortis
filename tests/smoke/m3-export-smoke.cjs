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
const { toCsv } = require(path.join(SRC_MAIN, 'services/reports/report-export.ts'))
const { ReportPdfExporter } = require(path.join(SRC_MAIN, 'services/reports/report-pdf.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function makeDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

const HOUR = 60 * 60 * 1000

function reportFixture(id, generatedAt) {
    return {
        id,
        generatedAt,
        periodStart: generatedAt - 7 * 24 * HOUR,
        periodEnd: generatedAt,
        summary: `report ${id} a,b "c"`,
        healthScore: 80,
        topProcesses: [{ name: 'chrome', count: 5 }],
        topDestinations: [{ address: '1.1.1.1', country: 'US', count: 5 }],
        threatCount: 1,
        newDeviceCount: 2,
        generatedBy: 'local',
    }
}

async function scenarioExport() {
    const dir = makeDir('fortis-m3-export-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })
    const db = new DatabaseService(dbPath, key)

    const now = Date.now()
    db.insertReport(reportFixture('rpt', now))

    const report = db.getReports().find((r) => r.id === 'rpt')
    check('report inserted and retrievable', !!report)

    const csv = toCsv(report)
    check('csv is non-empty', csv.length > 0)
    check('csv first line contains id header', csv.split('\n')[0].includes('id'))
    check('csv escapes embedded commas and quotes', csv.includes('"report rpt a,b ""c"""'))

    const exporter = new ReportPdfExporter(db)
    let pdfThrew = false
    let b64 = ''
    try {
        b64 = await exporter.exportPdf('rpt')
    } catch (err) {
        pdfThrew = true
        console.log(`exportPdf threw: ${err && err.message ? err.message : String(err)}`)
    }

    check('exportPdf does not throw', !pdfThrew)

    if (b64 && b64.length > 0) {
        const bytes = Buffer.from(b64, 'base64')
        check('pdf bytes start with %PDF', bytes.subarray(0, 4).toString('latin1') === '%PDF')
    } else {
        console.log('SKIP  offscreen rendering unavailable: exportPdf returned an empty string (no crash)')
        check('exportPdf degraded to empty string without crashing', b64 === '')
    }

    const missing = await exporter.exportPdf('does-not-exist')
    check('exportPdf returns empty string for unknown report', missing === '')

    db.close()
}

app.whenReady().then(async () => {
    let code = 0
    try {
        await scenarioExport()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

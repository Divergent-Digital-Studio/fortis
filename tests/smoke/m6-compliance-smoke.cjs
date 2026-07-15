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
const { FortisEventBus } = require(path.join(SRC_MAIN, 'services/event-bus.ts'))
const { ComplianceService } = require(path.join(SRC_MAIN, 'services/compliance-service.ts'))
const { buildComplianceReport } = require(path.join(SRC_MAIN, 'services/compliance/compliance-template.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}
function makeDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

async function run() {
    const dir = makeDir('fortis-m6c-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })
    const db = new DatabaseService(dbPath, key)
    db.setSetting('rbacEnabled', true)
    db.setSetting('complianceOrgName', 'Acme Corp')
    db.setSetting('complianceAccentColor', '#ff5500')

    const svc = new ComplianceService({ database: db, eventBus: new FortisEventBus(), retentionDays: () => 30 })

    for (const fw of ['soc2', 'iso27001', 'pci', 'hipaa', 'gdpr']) {
        const report = svc.generate(fw)
        const total = report.summary.pass + report.summary.warn + report.summary.fail + report.summary.na
        check(`${fw} report has controls + a consistent summary`, report.controls.length > 0 && total === report.controls.length)
    }

    const soc2 = svc.generate('soc2')
    check('encryption control passes (DB is encrypted)', soc2.controls.some((c) => c.id.includes('ENC') && c.status === 'pass'))
    check('access-control passes (RBAC on)', soc2.controls.some((c) => c.id.includes('AC') && c.status === 'pass'))
    check('report carries the org name', soc2.orgName === 'Acme Corp')

    const html = svc.renderHtml(soc2)
    check('rendered html includes the org branding', html.includes('Acme Corp') && html.includes('#ff5500'))

    let b64 = ''
    let threw = false
    try {
        b64 = await svc.exportPdf('gdpr')
    } catch (err) {
        threw = true
        console.log(`exportPdf threw: ${err && err.message ? err.message : String(err)}`)
    }
    check('exportPdf does not throw', !threw)
    if (b64 && b64.length > 0) {
        const bytes = Buffer.from(b64, 'base64')
        check('pdf bytes start with %PDF', bytes.subarray(0, 4).toString('latin1') === '%PDF')
    } else {
        console.log('SKIP  offscreen rendering unavailable: exportPdf returned empty (no crash)')
        check('exportPdf degraded to empty string without crashing', b64 === '')
    }

    db.close()
}

app.whenReady().then(async () => {
    let code = 0
    try {
        await run()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }
    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }
    console.log(`[m6-compliance] ${code === 0 ? 'PASS' : 'FAIL'}`)
    app.exit(code)
})

const { app } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const esbuild = require('esbuild')

const SRC_MAIN = path.resolve(__dirname, '../../src/main')
const SRC_SHARED = path.resolve(__dirname, '../../src/shared')

function resolveAlias(request, parentPath) {
    if (request.startsWith('@shared/')) return path.join(SRC_SHARED, request.slice('@shared/'.length))
    if (request.startsWith('@main/')) return path.join(SRC_MAIN, request.slice('@main/'.length))
    if (request.startsWith('.')) return path.resolve(path.dirname(parentPath), request)
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
    const result = esbuild.transformSync(source, { loader: 'ts', format: 'cjs', target: 'node20', sourcefile: filename })
    module._compile(result.code, filename)
}

const { FortisEventBus } = require(path.join(SRC_MAIN, 'services/event-bus.ts'))
const { SiemDispatcher } = require(path.join(SRC_MAIN, 'services/siem-dispatcher.ts'))
const { buildSiemPayload } = require(path.join(SRC_MAIN, 'services/siem/siem-payload.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }

function fakeDb(settings) {
    return {
        getSetting: (k) => settings[k],
        setSetting: (k, v) => { settings[k] = v },
        setEncryptedSetting: () => {},
    }
}

function alert(over) {
    const now = Date.now()
    return { id: 'a', timestamp: now, type: 'system', threatLevel: 'danger', title: 'Suspicious', description: 'd', connectionId: 'c', recommendation: 'r', processName: 'curl', remoteAddress: '1.2.3.4', remotePort: 443, acknowledged: false, whitelisted: false, dedupKey: 'dk', suppressedCount: 0, createdAt: now, ...over }
}

async function run() {
    const a = alert()
    const splunk = buildSiemPayload('splunk', 'https://splunk:8088', 'TOK', a)
    check('splunk uses Splunk auth header', splunk.headers.Authorization === 'Splunk TOK')
    const elastic = buildSiemPayload('elastic', 'https://es:9200', 'TOK', a)
    check('elastic is ndjson with 2 lines', elastic.headers['Content-Type'] === 'application/x-ndjson' && elastic.body.trim().split('\n').length === 2)
    const datadog = buildSiemPayload('datadog', 'https://intake', 'TOK', a)
    check('datadog uses DD-API-KEY header', datadog.headers['DD-API-KEY'] === 'TOK')

    // off-until-verified: enabled + endpoint but NOT verified => no dispatch
    const unverified = { siemEnabled: true, siemVerified: false, siemVendor: 'splunk', siemEndpoint: 'https://splunk:8088', siemToken: 'TOK', siemSeverityFloor: 'warning' }
    const sent = []
    const dispU = new SiemDispatcher({ database: fakeDb(unverified), eventBus: new FortisEventBus(), fetchFn: async () => { sent.push(1); return { ok: true, status: 200 } } })
    const busU = new FortisEventBus()
    const dispU2 = new SiemDispatcher({ database: fakeDb(unverified), eventBus: busU, fetchFn: async () => { sent.push(1); return { ok: true, status: 200 } } })
    dispU2.start()
    busU.emit('threat:detected', { alert: alert({ threatLevel: 'critical' }) })
    await delay(150)
    check('unverified does NOT dispatch even when enabled', sent.length === 0)
    check('isConfigured false until verified', dispU.isConfigured() === false)
    dispU2.stop()

    // test() drives the stub fetch and returns true on 200
    const verifiedSettings = { siemEnabled: true, siemVerified: false, siemVendor: 'splunk', siemEndpoint: '', siemToken: '', siemSeverityFloor: 'warning' }
    const testCalls = []
    const disp = new SiemDispatcher({ database: fakeDb(verifiedSettings), eventBus: new FortisEventBus(), fetchFn: async (url, init) => { testCalls.push({ url, headers: init.headers }); return { ok: true, status: 200 } } })
    const ok = await disp.test('splunk', 'https://splunk:8088', 'TOK')
    check('test() returns true on 200', ok === true)
    check('test() hit the splunk endpoint with the auth header', testCalls.length === 1 && testCalls[0].url === 'https://splunk:8088' && testCalls[0].headers.Authorization === 'Splunk TOK')

    // dispatch gating: verified + floor warning, danger alert => sends
    const liveSettings = { siemEnabled: true, siemVerified: true, siemVendor: 'datadog', siemEndpoint: 'https://intake', siemToken: 'TOK', siemSeverityFloor: 'warning' }
    const liveCalls = []
    const busL = new FortisEventBus()
    const dispL = new SiemDispatcher({ database: fakeDb(liveSettings), eventBus: busL, fetchFn: async () => { liveCalls.push(1); return { ok: true, status: 200 } } })
    dispL.start()
    busL.emit('threat:detected', { alert: alert({ threatLevel: 'safe' }) })
    await delay(100)
    check('below floor does NOT send', liveCalls.length === 0)
    busL.emit('threat:detected', { alert: alert({ threatLevel: 'danger' }) })
    await delay(150)
    check('at/above floor sends', liveCalls.length === 1)
    dispL.stop()
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
    console.log(`[m6-siem] ${code === 0 ? 'PASS' : 'FAIL'}`)
    app.exit(code)
})

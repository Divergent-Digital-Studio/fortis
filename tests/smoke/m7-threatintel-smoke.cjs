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
const { ThreatIntelDispatcher } = require(path.join(SRC_MAIN, 'services/threat-intel-dispatcher.ts'))
const { buildSubmission } = require(path.join(SRC_MAIN, 'services/community/threat-intel-payload.ts'))

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
        getRecentAlerts: () => [],
    }
}

function alert(over) {
    const now = Date.now()
    return { id: 'a', timestamp: now, type: 'system', threatLevel: 'danger', title: 'Suspicious beacon', description: 'd', connectionId: 'c', recommendation: 'r', processName: 'curl', remoteAddress: '203.0.113.7', remotePort: 443, acknowledged: false, whitelisted: false, dedupKey: 'dk', suppressedCount: 0, createdAt: now, ...over }
}

async function run() {
    const opaqueHash = (ip) => `xxhashxx${ip.length}`

    // anonymization: payload never carries the raw IP or process name
    const sub = buildSubmission(alert(), opaqueHash)
    const json = JSON.stringify(sub)
    check('submission omits raw destination IP', !json.includes('203.0.113.7'))
    check('submission omits process name', !json.includes('curl'))
    check('submission carries a destHash', typeof sub.destHash === 'string' && sub.destHash.length > 0)
    check('submission bucketed to 5-minute granularity', sub.bucketedAt % (5 * 60 * 1000) === 0)

    // off-until-verified: enabled + endpoint but NOT verified => no dispatch
    const unverified = { threatIntelEnabled: true, threatIntelVerified: false, threatIntelEndpoint: 'https://intel:443/submit', threatIntelKey: 'K', threatIntelSeverityFloor: 'warning' }
    const sentU = []
    const busU = new FortisEventBus()
    const dispU = new ThreatIntelDispatcher({ database: fakeDb(unverified), eventBus: busU, fetchFn: async () => { sentU.push(1); return { ok: true, status: 200 } } })
    dispU.start()
    busU.emit('threat:detected', { alert: alert({ threatLevel: 'critical' }) })
    await delay(150)
    check('unverified does NOT dispatch even when enabled', sentU.length === 0)
    check('getState reports enabled but unverified', dispU.getState().enabled === true && dispU.getState().verified === false)
    dispU.stop()

    // test() drives the stub fetch and flips verified
    const cfg = { threatIntelEnabled: true, threatIntelVerified: false, threatIntelEndpoint: '', threatIntelKey: '', threatIntelSeverityFloor: 'warning' }
    const testCalls = []
    const disp = new ThreatIntelDispatcher({ database: fakeDb(cfg), eventBus: new FortisEventBus(), fetchFn: async (url, init) => { testCalls.push({ url, body: init.body }); return { ok: true, status: 200 } } })
    const ok = await disp.test('https://intel:443/submit', 'K')
    check('test() returns true on 200', ok === true)
    check('test() flips verified', cfg.threatIntelVerified === true)
    check('test() hit the endpoint', testCalls.length === 1 && testCalls[0].url === 'https://intel:443/submit')

    // dispatch gating: verified + floor warning, danger alert => sends an anonymized body
    const live = { threatIntelEnabled: true, threatIntelVerified: true, threatIntelEndpoint: 'https://intel:443/submit', threatIntelKey: 'K', threatIntelSeverityFloor: 'warning' }
    const liveBodies = []
    const busL = new FortisEventBus()
    const dispL = new ThreatIntelDispatcher({ database: fakeDb(live), eventBus: busL, fetchFn: async (_u, init) => { liveBodies.push(init.body); return { ok: true, status: 200 } } })
    dispL.start()
    busL.emit('threat:detected', { alert: alert({ threatLevel: 'safe' }) })
    await delay(100)
    check('below floor does NOT send', liveBodies.length === 0)
    busL.emit('threat:detected', { alert: alert({ threatLevel: 'danger' }) })
    await delay(150)
    check('at/above floor sends', liveBodies.length === 1)
    check('dispatched body omits the raw IP', liveBodies.length === 1 && !liveBodies[0].includes('203.0.113.7'))
    check('dispatched body omits the process name', liveBodies.length === 1 && !liveBodies[0].includes('curl'))
    check('dispatched body carries destHash', liveBodies.length === 1 && liveBodies[0].includes('destHash'))
    check('submittedCount incremented', dispL.getState().submittedCount === 1)
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
    console.log(`[m7-threatintel] ${code === 0 ? 'PASS' : 'FAIL'}`)
    app.exit(code)
})

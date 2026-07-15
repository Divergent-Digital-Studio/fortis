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

const checks = []
function check(label, pass) {
    checks.push([label, pass])
}

const { FortisEventBus } = require(path.join(SRC_MAIN, 'services/event-bus.ts'))
const { PagerDutyDispatcher } = require(path.join(SRC_MAIN, 'services/pagerduty-dispatcher.ts'))

function fakeDb(settings) {
    return {
        getSetting: (k) => settings[k],
        setSetting: (k, v) => { settings[k] = v },
        setEncryptedSetting: () => {},
    }
}

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

async function run() {
    const calls = []
    const fetchFn = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return { ok: true, status: 202 }
    }

    // --- test() builds and posts a correct enqueue body ---
    const settings = { pagerDutyEnabled: false, pagerDutyRoutingKey: '', pagerDutySeverityFloor: 'critical' }
    const bus = new FortisEventBus()
    const pd = new PagerDutyDispatcher({ database: fakeDb(settings), eventBus: bus, fetchFn, source: 'fortis-test' })

    const ok = await pd.test('routingkey12345')
    check('test() returns true on 202', ok === true)
    check('test() hit the enqueue url', calls.length === 1 && calls[0].url === 'https://events.pagerduty.com/v2/enqueue')
    check('test() body is a v2 trigger', calls[0] && calls[0].body.event_action === 'trigger')
    check('test() carries the routing key', calls[0] && calls[0].body.routing_key === 'routingkey12345')
    check('test() severity is critical', calls[0] && calls[0].body.payload.severity === 'critical')

    // --- short key never sends ---
    const ok2 = await pd.test('short')
    check('test() rejects a too-short key without sending', ok2 === false && calls.length === 1)

    // --- enabled + key but NOT verified => no dispatch (off-until-tested gate) ---
    const unverified = { pagerDutyEnabled: true, pagerDutyVerified: false, pagerDutyRoutingKey: 'routingkey12345', pagerDutySeverityFloor: 'info' }
    const unverifiedCalls = []
    const busU = new FortisEventBus()
    const pdU = new PagerDutyDispatcher({
        database: fakeDb(unverified), eventBus: busU,
        fetchFn: async () => { unverifiedCalls.push(1); return { ok: true, status: 202 } },
    })
    pdU.start()
    busU.emit('threat:detected', {
        alert: { id: 'u', timestamp: Date.now(), type: 'system', threatLevel: 'critical', title: 't', description: 'd', connectionId: 'c', recommendation: 'r', acknowledged: false, whitelisted: false, dedupKey: 'du', suppressedCount: 0, createdAt: Date.now() },
    })
    await delay(150)
    check('unverified key does NOT dispatch even when enabled', unverifiedCalls.length === 0)
    check('isConfigured false until verified', pdU.isConfigured() === false)
    pdU.stop()

    // --- dispatch gating: enabled, floor critical, warning alert => no send ---
    settings.pagerDutyEnabled = true
    settings.pagerDutyVerified = true
    settings.pagerDutyRoutingKey = 'routingkey12345'
    settings.pagerDutySeverityFloor = 'critical'
    pd.start()
    bus.emit('threat:detected', {
        alert: {
            id: 'a-warn', timestamp: Date.now(), type: 'system', threatLevel: 'warning',
            title: 'low', description: 'x', connectionId: 'c', recommendation: 'r',
            acknowledged: false, whitelisted: false, dedupKey: 'd1', suppressedCount: 0, createdAt: Date.now(),
        },
    })
    await delay(200)
    check('warning below floor does NOT send', calls.length === 1)

    // --- dispatch gating: critical alert => sends ---
    bus.emit('threat:detected', {
        alert: {
            id: 'a-crit', timestamp: Date.now(), type: 'system', threatLevel: 'critical',
            title: 'high', description: 'x', connectionId: 'c', recommendation: 'r',
            acknowledged: false, whitelisted: false, dedupKey: 'd2', suppressedCount: 0, createdAt: Date.now(),
        },
    })
    await delay(200)
    check('critical at/above floor sends', calls.length === 2 && calls[1].body.dedup_key === 'd2')
    pd.stop()

    // --- not configured: no send even if enabled ---
    const calls2 = []
    const settings2 = { pagerDutyEnabled: true, pagerDutyRoutingKey: '', pagerDutySeverityFloor: 'info' }
    const pd2 = new PagerDutyDispatcher({
        database: fakeDb(settings2), eventBus: new FortisEventBus(),
        fetchFn: async (url, init) => { calls2.push(init); return { ok: true, status: 202 } },
    })
    check('isConfigured false with empty key', pd2.isConfigured() === false)
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
    console.log(`[m5-pagerduty] ${code === 0 ? 'PASS' : 'FAIL'}`)
    app.exit(code)
})

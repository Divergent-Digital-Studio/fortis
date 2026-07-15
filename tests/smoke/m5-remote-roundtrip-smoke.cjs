const { app } = require('electron')
const path = require('node:path')
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

const checks = []
function check(label, pass) {
    checks.push([label, pass])
}

let WebSocket
let WebSocketServer
try {
    const ws = require('ws')
    WebSocket = ws.WebSocket
    WebSocketServer = ws.WebSocketServer
} catch {
    WebSocket = null
}

const { FortisEventBus } = require(path.join(SRC_MAIN, 'services/event-bus.ts'))
const { RemoteServer } = require(path.join(SRC_MAIN, 'services/remote-server.ts'))
const { encodeFrame } = require(path.join(SRC_SHARED, 'remote/frame.ts'))

const TOKEN = 'super-secret-token'
const WRONG = 'wrong-token'

function makeServerFactory(wss) {
    return () => ({
        onConnection: (cb) => wss.on('connection', (sock) => cb(adapt(sock))),
        onError: (cb) => wss.on('error', cb),
        close: () => wss.close(),
    })
}

function adapt(socket) {
    return {
        on: (event, cb) => {
            if (event === 'message') socket.on('message', (d) => cb(d))
            else if (event === 'close') socket.on('close', () => cb())
            else socket.on('error', (e) => cb(e))
        },
        send: (d) => socket.send(d),
        close: (code) => socket.close(code),
    }
}

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

async function run() {
    if (!WebSocket) {
        console.log('SKIP  ws module unavailable')
        return
    }

    const bus = new FortisEventBus()
    const events = []
    let agentsSeen = []
    bus.on('remote:event', (p) => events.push(p.item))
    bus.on('remote:agents', (p) => { agentsSeen = p.agents })

    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise((resolve) => wss.on('listening', resolve))
    const port = wss.address().port

    const server = new RemoteServer({
        eventBus: bus,
        getToken: () => TOKEN,
        getConfig: () => ({ enabled: true, host: '127.0.0.1', port }),
        serverFactory: makeServerFactory(wss),
    })
    server.start()

    // --- valid handshake ---
    const client = new WebSocket(`ws://127.0.0.1:${port}`)
    let gotWelcome = false
    client.on('open', () => {
        client.send(encodeFrame({ v: 1, type: 'hello', ts: Date.now(), agentId: 'agent-a', platform: 'linux', token: TOKEN }))
    })
    client.on('message', (data) => {
        const msg = JSON.parse(typeof data === 'string' ? data : data.toString())
        if (msg.type === 'welcome') {
            gotWelcome = true
            client.send(encodeFrame({ v: 1, type: 'connections', ts: Date.now(), connections: [{ id: 'c1' }, { id: 'c2' }] }))
        }
    })
    await delay(600)

    check('valid token receives welcome', gotWelcome)
    check('roster has the agent', agentsSeen.length === 1 && agentsSeen[0].agentId === 'agent-a')
    check('connections frame produced a remote:event', events.some((e) => e.kind === 'connections' && e.count === 2))

    // --- wrong token rejected ---
    const bad = new WebSocket(`ws://127.0.0.1:${port}`)
    let badCloseCode = null
    bad.on('open', () => {
        bad.send(encodeFrame({ v: 1, type: 'hello', ts: Date.now(), agentId: 'agent-b', platform: 'linux', token: WRONG }))
    })
    bad.on('close', (code) => { badCloseCode = code })
    await delay(600)

    check('wrong token closes with 4401', badCloseCode === 4401)
    check('wrong token not added to roster', !agentsSeen.some((a) => a.agentId === 'agent-b'))

    try { client.close() } catch { /* noop */ }
    server.stop()
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
    if (checks.length === 0) console.log('[m5-remote-roundtrip] SKIP')
    else console.log(`[m5-remote-roundtrip] ${code === 0 ? 'PASS' : 'FAIL'}`)
    app.exit(code)
})

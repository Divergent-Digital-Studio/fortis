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

const http = require('node:http')
const { FortisEventBus } = require(path.join(SRC_MAIN, 'services/event-bus.ts'))
const { RestApiServer } = require(path.join(SRC_MAIN, 'services/rest-api-server.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function get(port, pathName, authHeader) {
    return new Promise((resolve, reject) => {
        const headers = authHeader ? { Authorization: authHeader } : {}
        const req = http.request({ host: '127.0.0.1', port, path: pathName, method: 'GET', headers }, (res) => {
            let body = ''
            res.on('data', (c) => { body += c })
            res.on('end', () => resolve({ status: res.statusCode, body }))
        })
        req.on('error', reject)
        req.end()
    })
}

function waitForListen(server) {
    return new Promise((resolve) => {
        const start = Date.now()
        const tick = () => {
            const s = server.getState()
            if (s.listening || Date.now() - start > 3000) resolve(s)
            else setTimeout(tick, 25)
        }
        tick()
    })
}

async function run() {
    const TOKEN = 'rest-secret-token-123'
    const settings = { restApiEnabled: true, restApiPort: 0, restApiToken: TOKEN }
    let boundPort = 0

    const server = new RestApiServer({
        eventBus: new FortisEventBus(),
        getConfig: () => ({ enabled: settings.restApiEnabled, host: '127.0.0.1', port: settings.restApiPort }),
        getToken: () => settings.restApiToken,
        data: {
            health: () => ({ ok: true }),
            connections: () => [{ processName: 'curl', remoteAddress: '1.2.3.4' }],
            alerts: () => [{ id: 'a1', title: 'x' }],
            agents: () => 0,
        },
        serverFactory: (handler) => {
            const srv = http.createServer(handler)
            return {
                listen: (port, host, cb) => srv.listen(port, host, () => { boundPort = srv.address().port; cb() }),
                on: (event, cb) => srv.on(event, cb),
                close: (cb) => srv.close(cb),
            }
        },
    })

    server.start()
    await waitForListen(server)
    check('server reports listening', server.getState().listening === true)
    check('server bound to 127.0.0.1', server.getState().host === '127.0.0.1')

    const authed = await get(boundPort, '/api/v1/health', `Bearer ${TOKEN}`)
    check('authed health returns 200', authed.status === 200)
    check('authed health body has data.ok', authed.status === 200 && JSON.parse(authed.body).data.ok === true)

    const unauthed = await get(boundPort, '/api/v1/health', undefined)
    check('missing bearer returns 401', unauthed.status === 401)

    const wrongTok = await get(boundPort, '/api/v1/health', 'Bearer nope')
    check('wrong bearer returns 401', wrongTok.status === 401)

    const conns = await get(boundPort, '/api/v1/connections', `Bearer ${TOKEN}`)
    check('authed connections returns 200', conns.status === 200)

    const badPath = await get(boundPort, '/api/v1/nope', `Bearer ${TOKEN}`)
    check('unknown path returns 404', badPath.status === 404)

    server.stop()
    check('stop() clears listening', server.getState().listening === false)

    // off-until-token: a server with an empty token refuses to start
    const noTokSettings = { restApiEnabled: true, restApiPort: 0, restApiToken: '' }
    const noTokServer = new RestApiServer({
        eventBus: new FortisEventBus(),
        getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 0 }),
        getToken: () => noTokSettings.restApiToken,
        data: { health: () => ({}), connections: () => [], alerts: () => [], agents: () => 0 },
    })
    noTokServer.start()
    check('server refuses to start without a token', noTokServer.getState().listening === false)
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
    console.log(`[m6-rest-api] ${code === 0 ? 'PASS' : 'FAIL'}`)
    app.exit(code)
})

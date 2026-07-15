const { app } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const tls = require('node:tls')
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

const { parseCert } = require(path.join(SRC_MAIN, 'services/net/cert-parse.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

const HOST = 'example.com'
const PORT = 443

function fetchPeerCert() {
    return new Promise((resolve) => {
        let settled = false
        const finish = (value) => {
            if (settled) return
            settled = true
            resolve(value)
        }
        try {
            const socket = tls.connect(
                { host: HOST, port: PORT, servername: HOST, rejectUnauthorized: false, timeout: 5000 },
                () => {
                    const peer = socket.getPeerCertificate(true)
                    socket.destroy()
                    finish({ ok: true, peer })
                },
            )
            socket.on('error', (err) => {
                socket.destroy()
                finish({ ok: false, reason: err && err.message ? err.message : String(err) })
            })
            socket.on('timeout', () => {
                socket.destroy()
                finish({ ok: false, reason: 'timeout' })
            })
        } catch (err) {
            finish({ ok: false, reason: err && err.message ? err.message : String(err) })
        }
    })
}

async function run() {
    const now = Date.now()
    const result = await fetchPeerCert()

    if (result.ok) {
        const info = parseCert(result.peer, HOST, PORT, now)
        check('online: status is valid/expiring/self-signed', ['valid', 'expiring', 'self-signed'].includes(info.status))
        check('online: issuer is non-null', info.issuer !== null)
        check('online: hostPort matches', info.hostPort === `${HOST}:${PORT}`)
        console.log(`INFO  ${HOST}:${PORT} cert status=${info.status} issuer=${info.issuer}`)
    } else {
        console.log(`SKIP  no network for ${HOST}:${PORT} (${result.reason}) — verifying graceful error handling`)
        const info = parseCert({}, HOST, PORT, now)
        check('offline: empty cert yields status error', info.status === 'error')
        check('offline: hostPort still set', info.hostPort === `${HOST}:${PORT}`)
    }
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

    app.exit(code)
})

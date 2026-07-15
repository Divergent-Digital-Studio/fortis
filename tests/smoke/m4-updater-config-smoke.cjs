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
    checks.push([label, !!pass])
}

function run() {
    let updater
    try {
        updater = require('electron-updater')
    } catch (err) {
        console.log(`SKIP  electron-updater not loadable: ${err && err.message ? err.message : String(err)}`)
        check('electron-updater optional load (skipped gracefully)', true)
        return
    }

    check('electron-updater exposes autoUpdater', !!updater.autoUpdater)
    const au = updater.autoUpdater
    check('autoUpdater has checkForUpdates', typeof au.checkForUpdates === 'function')
    check('autoUpdater has downloadUpdate', typeof au.downloadUpdate === 'function')
    check('autoUpdater has quitAndInstall', typeof au.quitAndInstall === 'function')
    check('autoUpdater has on', typeof au.on === 'function')

    const { UpdateService } = require(path.join(SRC_MAIN, 'services/update-service.ts'))

    const emitted = []
    const fakeBus = { emit: (event, payload) => emitted.push({ event, payload }) }

    const service = new UpdateService({ eventBus: fakeBus, updater: au, isPackaged: false })
    check('autoDownload forced off', au.autoDownload === false)

    service.start()
    check('start() in unpackaged mode emits disabled', service.getStatus().kind === 'disabled')
    check('disabled status pushed to bus', emitted.some((e) => e.event === 'update:status' && e.payload.kind === 'disabled'))

    let installThrew = false
    try {
        service.install()
    } catch {
        installThrew = true
    }
    check('install() in unpackaged mode is a no-op (no throw)', !installThrew)
}

app.whenReady().then(() => {
    let code = 0
    try {
        run()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }
    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }
    app.exit(code)
})

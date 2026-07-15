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
const { eventBus } = require(path.join(SRC_MAIN, 'services/event-bus.ts'))
const { DefenseService } = require(path.join(SRC_MAIN, 'services/defense-service.ts'))
const {
    buildBlockCommand,
    buildUnblockCommand,
} = require(path.join(SRC_MAIN, 'services/defense/firewall-rule-builder.ts'))
const { buildKillCommand } = require(path.join(SRC_MAIN, 'services/defense/kill-command.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function makeDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

let runCommandCalls = 0
const mockRunCommand = async () => {
    runCommandCalls += 1
    return { code: 0, stdout: '', stderr: '' }
}

async function scenarioFirewall() {
    const platform = process.platform

    const block = buildBlockCommand(platform, '1.2.3.4')
    check('buildBlockCommand returns a cmd string for current platform', typeof block.cmd === 'string' && block.cmd.length > 0)
    check('buildBlockCommand returns args array', Array.isArray(block.args))

    const unblock = buildUnblockCommand(platform, '1.2.3.4')
    check('buildUnblockCommand returns a cmd string for current platform', typeof unblock.cmd === 'string' && unblock.cmd.length > 0)

    const kill = buildKillCommand(platform, 4321)
    check('buildKillCommand returns a cmd string for current platform', typeof kill.cmd === 'string' && kill.cmd.length > 0)
    check('buildKillCommand includes the pid', kill.args.includes('4321'))

    const dir = makeDir('fortis-m3-fw-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })
    const db = new DatabaseService(dbPath, key)

    const service = new DefenseService({
        database: db,
        eventBus,
        platform,
        runCommand: mockRunCommand,
    })

    db.insertDefenseAction({
        id: 'block-1',
        createdAt: Date.now(),
        kind: 'block',
        status: 'pending',
        target: '5.6.7.8',
        processName: null,
        reason: 'firewall smoke',
        ruleId: null,
        executedAt: null,
        error: null,
    })

    await service.confirmBlock('block-1')

    const after = db.getDefenseAction('block-1')
    check('confirmBlock transitions the action to executed', !!after && after.status === 'executed')
    check('confirmBlock added a blocked_ips row', db.getBlockedIps(true).some((b) => b.ip === '5.6.7.8'))
    check('mock runCommand was invoked (dry run, no real OS call)', runCommandCalls >= 1)

    db.close()
}

app.whenReady().then(async () => {
    let code = 0
    try {
        await scenarioFirewall()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }

    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }

    app.exit(code)
})

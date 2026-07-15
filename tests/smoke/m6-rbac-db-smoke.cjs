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
const { SessionService } = require(path.join(SRC_MAIN, 'services/session-service.ts'))
const { FortisEventBus } = require(path.join(SRC_MAIN, 'services/event-bus.ts'))
const { hasScope, requiredScopeFor } = require(path.join(SRC_MAIN, 'services/auth/role-scope.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function makeDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function run() {
    const dir = makeDir('fortis-m6-')
    const dbPath = path.join(dir, 'fortis.db')
    const key = provisionDbKey({ safeStorage, fileStore: nodeFileStore(), dir })
    const db = new DatabaseService(dbPath, key)
    const bus = new FortisEventBus()
    const session = new SessionService({ database: db, eventBus: bus })

    check('migration 006 applied (countUsers starts at 0)', db.countUsers() === 0)

    const admin = session.bootstrapAdmin('root', 'sup3rsecret')
    check('bootstrapAdmin creates an admin', !!admin && admin.role === 'admin')
    check('second bootstrapAdmin is refused once a user exists', session.bootstrapAdmin('x', 'yyyyyy') === null)

    const mgr = session.createUser('netmgr', 'managerpass', 'manager')
    const obs = session.createUser('watcher', 'observerpw', 'observer')
    check('manager + observer created', !!mgr && !!obs && db.countUsers() === 3)

    const sess = session.login('root', 'sup3rsecret')
    check('login returns a session with the admin role', !!sess && sess.role === 'admin' && sess.token.length === 64)

    const resolved = session.resolve(sess.token)
    check('resolve(token) returns the admin role', !!resolved && resolved.role === 'admin')
    check('resolve rejects a bogus token', session.resolve('deadbeef') === null)

    check('wrong password is rejected', session.login('root', 'wrong') === null)

    session.setUserDisabled(obs.id, true)
    check('a disabled user cannot log in', session.login('watcher', 'observerpw') === null)

    check('admin has manage-users scope', hasScope('admin', 'manage-users') === true)
    check('observer lacks manage-users scope', hasScope('observer', 'manage-users') === false)
    check('manager lacks manage-users scope', hasScope('manager', 'manage-users') === false)
    check('users:create maps to manage-users', requiredScopeFor('users:create') === 'manage-users')
    check('auth:login is a public channel (null scope)', requiredScopeFor('auth:login') === null)

    const mgrResolved = session.resolve(session.login('netmgr', 'managerpass').token)
    check('manager session resolves to manager role', !!mgrResolved && mgrResolved.role === 'manager')
    check('manager cannot manage-users but can manage-integrations', hasScope(mgrResolved.role, 'manage-users') === false && hasScope(mgrResolved.role, 'manage-integrations') === true)

    db.close()
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
    console.log(`[m6-rbac-db] ${code === 0 ? 'PASS' : 'FAIL'}`)
    app.exit(code)
})

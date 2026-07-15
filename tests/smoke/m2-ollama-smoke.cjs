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

const { OllamaProvider } = require(path.join(SRC_MAIN, 'services/providers/ollama-provider.ts'))

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

function stubDb(settings) {
    return {
        getSetting(key) {
            return settings[key]
        },
    }
}

async function run() {
    const provider = new OllamaProvider(stubDb({ ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: '' }))

    check('provider name is ollama', provider.name === 'ollama')

    const discovered = await provider.discoverModels()
    check('discoverModels returns an object', discovered && typeof discovered === 'object')
    check('discoverModels.models is an array', Array.isArray(discovered.models))
    check('discoverModels.available is a boolean', typeof discovered.available === 'boolean')

    const available = await provider.isAvailable()
    check('isAvailable returns a boolean without throwing', typeof available === 'boolean')

    if (discovered.available) {
        console.log(`INFO  Ollama is running locally with ${discovered.models.length} model(s)`)
    } else {
        console.log('INFO  Ollama not running locally — verified graceful unavailable handling')
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

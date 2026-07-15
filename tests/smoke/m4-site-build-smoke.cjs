const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const esbuild = require('esbuild')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'dist-site')

const Module = require('node:module')
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
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-site.mjs')], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, FORTIS_REPO: 'fortis/fortis' },
    })

    const indexPath = path.join(OUT, 'index.html')
    check('dist-site/index.html exists', fs.existsSync(indexPath))
    check('dist-site/detect.js exists', fs.existsSync(path.join(OUT, 'detect.js')))
    check('dist-site/site.js exists', fs.existsSync(path.join(OUT, 'site.js')))
    check('dist-site/styles.css exists', fs.existsSync(path.join(OUT, 'styles.css')))
    check('dist-site/.nojekyll exists', fs.existsSync(path.join(OUT, '.nojekyll')))

    const detectJs = fs.readFileSync(path.join(OUT, 'detect.js'), 'utf8')
    check('detect.js version placeholder replaced', !detectJs.includes('__VERSION__'))
    check('detect.js repo placeholder replaced', !detectJs.includes('__REPO__'))
    check('detect.js links to releases/latest/download', detectJs.includes('releases/latest/download/'))
    check('detect.js uses configured repo', detectJs.includes('fortis/fortis'))

    const siteJs = fs.readFileSync(path.join(OUT, 'site.js'), 'utf8')
    check('site.js highlights placeholder replaced', !siteJs.includes('__HIGHLIGHTS__'))
    check('site.js carries release highlights', siteJs.includes('Real-time connection monitoring'))

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    check('detect.js carries package version', detectJs.includes(pkg.version))
}

async function checkDetectParity() {
    const ts = require(path.join(ROOT, 'website/detect.ts'))
    const js = await import(path.join(ROOT, 'website/detect.js'))
    const cases = [
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) arm64', 'MacIntel'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', 'MacIntel'],
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32'],
        ['Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64'],
        ['Mozilla/5.0 (Linux; Android 14)', ''],
    ]
    let platformMatch = true
    let assetMatch = true
    for (const [ua, hint] of cases) {
        const a = ts.detectPlatform(ua, hint)
        const b = js.detectPlatform(ua, hint)
        if (a.os !== b.os || a.arch !== b.arch) platformMatch = false
        if (
            ts.downloadAssetName(a, '1.0.0') !== js.downloadAssetName(b, '1.0.0')
        ) {
            assetMatch = false
        }
    }
    check('detect.ts and detect.js detectPlatform agree (no drift)', platformMatch)
    check('detect.ts and detect.js downloadAssetName agree (no drift)', assetMatch)
}

async function main() {
    let code = 0
    try {
        run()
        await checkDetectParity()
    } catch (err) {
        check(`smoke threw: ${err && err.message ? err.message : String(err)}`, false)
    }
    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }
    process.exit(code)
}

void main()

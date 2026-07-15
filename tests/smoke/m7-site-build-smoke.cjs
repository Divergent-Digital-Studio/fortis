const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'dist-site')

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
    const html = fs.readFileSync(indexPath, 'utf8')

    check('no leftover __PRICING__ token', !html.includes('__PRICING__'))
    check('no leftover __FEATURE_MATRIX__ token', !html.includes('__FEATURE_MATRIX__'))
    check('no leftover __FAQ__ token', !html.includes('__FAQ__'))

    check('pricing section rendered (Fortress tier)', html.includes('Fortress'))
    check('pricing cards rendered', html.includes('pricing__card'))
    check('feature matrix rendered', html.includes('matrix__table'))
    check('FAQ rendered (privacy question)', html.includes('Does my data leave my machine?'))
    check('AppSumo launch copy present', html.toLowerCase().includes('appsumo'))

    check('downloads section preserved (no regression)', html.includes('downloads-list'))
    check('release-notes section preserved (no regression)', html.includes('release-notes'))

    check('styles.css carries pricing styles', fs.readFileSync(path.join(OUT, 'styles.css'), 'utf8').includes('.pricing__card'))
}

function main() {
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
    process.exit(code)
}

main()

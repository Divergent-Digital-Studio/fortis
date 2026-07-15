const path = require('node:path')
const fs = require('node:fs')
const yaml = require('js-yaml')
const esbuild = require('esbuild')

const ROOT = path.resolve(__dirname, '../..')

const checks = []
function check(label, pass) {
    checks.push([label, !!pass])
}

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

function loadTs(file) {
    return require(file)
}

function targetNames(targets) {
    return (targets || []).map((t) => (typeof t === 'string' ? t : t.target))
}

function archesFor(targets, name) {
    const entry = (targets || []).find((t) => (typeof t === 'string' ? t : t.target) === name)
    if (!entry || typeof entry === 'string') return []
    return entry.arch || []
}

function run() {
    const cfg = yaml.load(fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8'))

    check('publish provider is github', cfg.publish && cfg.publish.provider === 'github')
    check('publish repo is fortis', cfg.publish && cfg.publish.repo === 'fortis')
    check('publish owner is env-driven (no OWNER_PLACEHOLDER)', cfg.publish && cfg.publish.owner === '${FORTIS_REPO_OWNER}')

    const macTargets = targetNames(cfg.mac && cfg.mac.target)
    check('mac builds dmg', macTargets.includes('dmg'))
    const macArches = archesFor(cfg.mac && cfg.mac.target, 'dmg')
    check('mac dmg targets x64 and arm64', macArches.includes('x64') && macArches.includes('arm64'))
    check('mac hardenedRuntime enabled', cfg.mac && cfg.mac.hardenedRuntime === true)
    check('mac notarize enabled', cfg.mac && cfg.mac.notarize === true)
    check('mac entitlements set', cfg.mac && typeof cfg.mac.entitlements === 'string')

    const winTargets = targetNames(cfg.win && cfg.win.target)
    check('win builds nsis', winTargets.includes('nsis'))
    check('win declares publisherName (env-driven)', cfg.win && cfg.win.signtoolOptions && cfg.win.signtoolOptions.publisherName === '${FORTIS_PUBLISHER_NAME}')
    check('signtoolOptions declares sha256 + timestamp server', cfg.win && cfg.win.signtoolOptions && cfg.win.signtoolOptions.signingHashAlgorithms && cfg.win.signtoolOptions.signingHashAlgorithms.includes('sha256') && typeof cfg.win.signtoolOptions.rfc3161TimeStampServer === 'string')

    const linuxTargets = targetNames(cfg.linux && cfg.linux.target)
    check('linux builds AppImage', linuxTargets.includes('AppImage'))
    check('linux builds deb', linuxTargets.includes('deb'))

    const entitlementsPath = path.join(ROOT, 'build/entitlements.mac.plist')
    check('entitlements file exists', fs.existsSync(entitlementsPath))

    const detect = loadTs(path.join(ROOT, 'website/detect.ts'))
    const v = '1.0.0'
    check(
        'website mac arm64 asset name matches builder default',
        detect.downloadAssetName({ os: 'mac', arch: 'arm64' }, v) === `Fortis-${v}-arm64.dmg`,
    )
    check(
        'website mac x64 asset name matches builder default',
        detect.downloadAssetName({ os: 'mac', arch: 'x64' }, v) === `Fortis-${v}.dmg`,
    )
    check(
        'website win asset name matches builder artifactName',
        detect.downloadAssetName({ os: 'win', arch: 'x64' }, v) === `Fortis-${v}-setup.exe`,
    )
    check(
        'website linux AppImage name matches builder artifactName',
        detect.downloadAssetName({ os: 'linux', arch: 'x64' }, v) === `Fortis-${v}.AppImage`,
    )

    const winArtifact = cfg.win && cfg.win.artifactName
    check('win artifactName produces -setup suffix', winArtifact === '${productName}-${version}-setup.${ext}')
    const linuxArtifact = cfg.linux && cfg.linux.artifactName
    check('linux artifactName omits arch', linuxArtifact === '${productName}-${version}.${ext}')
}

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

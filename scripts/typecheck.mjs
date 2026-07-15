import { spawnSync } from 'node:child_process'

const tsc = process.platform === 'win32' ? 'node_modules\\.bin\\tsc.cmd' : 'node_modules/.bin/tsc'

const projects = ['tsconfig.node.json', 'tsconfig.web.json']

let failed = false
for (const project of projects) {
    console.log(`\n› tsc --noEmit -p ${project}`)
    const result = spawnSync(tsc, ['--noEmit', '-p', project], { stdio: 'inherit' })
    if (result.status !== 0) failed = true
}

process.exit(failed ? 1 : 0)

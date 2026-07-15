const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { spawn } = require('node:child_process')

const checks = []
function check(label, pass) {
    checks.push([label, pass])
}

function finish() {
    let code = 0
    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) code = 1
    }
    console.log(`[m5-agent-boot] ${code === 0 ? 'PASS' : 'FAIL'}`)
    process.exit(code)
}

let WebSocketServer
try {
    WebSocketServer = require('ws').WebSocketServer
} catch {
    console.log('SKIP  ws module unavailable')
    console.log('[m5-agent-boot] SKIP')
    process.exit(0)
}

const agentBundle = path.resolve(__dirname, '../../out/main/agent.js')
if (!fs.existsSync(agentBundle)) {
    console.log('SKIP  out/main/agent.js missing — run npm run build first')
    console.log('[m5-agent-boot] SKIP')
    process.exit(0)
}

const TOKEN = 'agent-boot-token'

const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
wss.on('listening', () => {
    const port = wss.address().port
    const cfgPath = path.join(os.tmpdir(), `fortis-agent-smoke-${process.pid}.json`)
    fs.writeFileSync(
        cfgPath,
        JSON.stringify({ serverUrl: `ws://127.0.0.1:${port}`, token: TOKEN, scanIntervalMs: 2000 }),
    )

    let helloSeen = false
    let tokenMatched = false

    wss.on('connection', (socket) => {
        socket.on('message', (data) => {
            let msg
            try {
                msg = JSON.parse(data.toString())
            } catch {
                return
            }
            if (msg.type === 'hello') {
                helloSeen = true
                tokenMatched = msg.token === TOKEN
                socket.send(JSON.stringify({ v: 1, type: 'welcome', ts: Date.now(), serverVersion: '1.0.0' }))
            }
        })
    })

    const electronBin = process.execPath
    const child = spawn(electronBin, [agentBundle, '--config', cfgPath], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })

    const cleanup = () => {
        try { child.kill('SIGTERM') } catch { /* noop */ }
        try { wss.close() } catch { /* noop */ }
        try { fs.unlinkSync(cfgPath) } catch { /* noop */ }
    }

    setTimeout(() => {
        check('agent process sent a hello frame', helloSeen)
        check('agent hello carried the configured token', tokenMatched)
        if (!helloSeen && stderr) console.log(`INFO agent stderr: ${stderr.slice(0, 400)}`)
        cleanup()
        finish()
    }, 8000)
})

wss.on('error', (err) => {
    check(`ws server error: ${err.message}`, false)
    finish()
})

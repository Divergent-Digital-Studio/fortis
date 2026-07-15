const { app } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const Database = require('better-sqlite3-multiple-ciphers')

function openEncrypted(file, key) {
    const db = new Database(file)
    db.pragma("cipher='sqlcipher'")
    db.pragma(`key='${key}'`)
    return db
}

function run() {
    const file = path.join(os.tmpdir(), `fortis-sqlcipher-smoke-${process.pid}.db`)
    fs.rmSync(file, { force: true })
    const goodKey = 'correct-horse-battery-staple-32byteslong!!'
    const badKey = 'totally-the-wrong-key'

    const checks = []

    const dbW = openEncrypted(file, goodKey)
    dbW.exec('CREATE TABLE secret (id INTEGER PRIMARY KEY, v TEXT)')
    dbW.prepare('INSERT INTO secret (v) VALUES (?)').run('classified')
    dbW.close()

    const header = fs.readFileSync(file).subarray(0, 16).toString('utf8')
    checks.push(['file is NOT plaintext sqlite (header scrambled)', !header.startsWith('SQLite format 3')])

    let wrongKeyRejected = false
    try {
        const dbBad = openEncrypted(file, badKey)
        dbBad.prepare('SELECT count(*) AS c FROM secret').get()
        dbBad.close()
    } catch {
        wrongKeyRejected = true
    }
    checks.push(['wrong key is rejected', wrongKeyRejected])

    const dbR = openEncrypted(file, goodKey)
    const row = dbR.prepare('SELECT v FROM secret WHERE id = 1').get()
    dbR.close()
    checks.push(['right key reads the row back', row && row.v === 'classified'])

    fs.rmSync(file, { force: true })

    let ok = true
    for (const [label, pass] of checks) {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`)
        if (!pass) ok = false
    }
    return ok
}

app.whenReady().then(() => {
    let code = 1
    try {
        code = run() ? 0 : 1
    } catch (err) {
        console.log('FAIL  smoke threw:', err && err.message)
        code = 1
    }
    app.exit(code)
})

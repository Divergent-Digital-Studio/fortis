#!/usr/bin/env node
import { generateKeyPairSync, sign, createPrivateKey } from 'node:crypto'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const USAGE = `Fortis license keypair tool

Usage:
  node scripts/license-keygen.mjs init                 Generate a new ed25519 keypair (prints public key to embed, writes private key to .fortis-license-private.pem)
  node scripts/license-keygen.mjs issue <tier> [opts]  Issue a signed license key using .fortis-license-private.pem
                                                       tier: free | pro | enterprise
                                                       opts (flags): --days=N --machine=<id> --seats=N --customer=<id> --out=<file>

Examples:
  node scripts/license-keygen.mjs init
  node scripts/license-keygen.mjs issue pro --days=365 --customer=cust_123
  node scripts/license-keygen.mjs issue enterprise --machine=<machine-id-from-app> --seats=50 --days=365 --out=license.txt

Notes:
  - The PUBLIC key must be pasted into src/main/services/license/public-key.ts and committed.
  - The PRIVATE key (.fortis-license-private.pem) MUST stay offline (1Password / air-gapped). It is gitignored.
  - A license is only as trustworthy as your private-key custody.
`

const PRIVATE_KEY_PATH = resolve(ROOT, '.fortis-license-private.pem')

function cmdInit() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' })
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' })

    writeFileSync(PRIVATE_KEY_PATH, privPem, { mode: 0o600 })
    console.log('=== PRIVATE KEY written to .fortis-license-private.pem (KEEP OFFLINE) ===')
    console.log(`   path: ${PRIVATE_KEY_PATH}`)
    console.log('   This file is gitignored. Back it up to 1Password / secure storage now.\n')
    console.log('=== PUBLIC KEY (paste into src/main/services/license/public-key.ts) ===')
    console.log(pubPem)
}

function parseArgs(args) {
    const opts = { days: null, machine: null, seats: null, customer: null, out: null }
    for (const a of args) {
        if (a.startsWith('--days=')) {
            const n = parseInt(a.slice(7), 10)
            if (!Number.isFinite(n) || n <= 0) {
                console.error(`Invalid --days value: "${a.slice(7)}". Must be a positive integer.`)
                process.exit(1)
            }
            opts.days = n
        } else if (a.startsWith('--machine=')) opts.machine = a.slice(10)
        else if (a.startsWith('--seats=')) {
            const n = parseInt(a.slice(7), 10)
            if (!Number.isFinite(n) || n <= 0) {
                console.error(`Invalid --seats value: "${a.slice(7)}". Must be a positive integer.`)
                process.exit(1)
            }
            opts.seats = n
        } else if (a.startsWith('--customer=')) opts.customer = a.slice(11)
        else if (a.startsWith('--out=')) opts.out = a.slice(6)
        else {
            console.error(`Unknown argument: "${a}"`)
            process.exit(1)
        }
    }
    return opts
}

function cmdIssue(tier, extraArgs) {
    const VALID_TIERS = ['free', 'pro', 'enterprise']
    if (!VALID_TIERS.includes(tier)) {
        console.error(`Invalid tier "${tier}". Must be one of: ${VALID_TIERS.join(', ')}`)
        process.exit(1)
    }
    if (!existsSync(PRIVATE_KEY_PATH)) {
        console.error(`Private key not found at ${PRIVATE_KEY_PATH}. Run "init" first.`)
        process.exit(1)
    }

    const opts = parseArgs(extraArgs)
    const privateKeyPem = readFileSync(PRIVATE_KEY_PATH, 'utf8')

    const now = Date.now()
    const expiresAt = opts.days ? now + opts.days * 24 * 60 * 60 * 1000 : null

    const token = {
        v: 1,
        productId: 'fortis-desktop',
        tier,
        issuedAt: now,
        expiresAt,
        machineId: opts.machine ?? null,
        seatCount: opts.seats ?? null,
        customerId: opts.customer ?? null,
    }
    const payload = Buffer.from(JSON.stringify(token), 'utf8')
    const privateKey = createPrivateKey(privateKeyPem)
    const signature = sign(null, payload, privateKey)
    const b64url = (buf) => buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    const licenseKey = 'FORTIS-LICENSE-V1-' + b64url(payload) + '.' + b64url(signature)

    const summary = [
        `tier:       ${tier}`,
        opts.customer ? `customer:   ${opts.customer}` : null,
        opts.machine ? `machine:    ${opts.machine}` : null,
        opts.seats ? `seats:      ${opts.seats}` : null,
        opts.days ? `valid days: ${opts.days}` : 'valid days: unlimited',
        `issued at:  ${new Date(now).toISOString()}`,
        expiresAt ? `expires at: ${new Date(expiresAt).toISOString()}` : 'expires at: never',
    ].filter(Boolean).join('\n')

    if (opts.out) {
        writeFileSync(opts.out, licenseKey + '\n')
        console.log(`License written to ${opts.out}`)
        console.log(summary)
    } else {
        console.log('=== LICENSE KEY ===')
        console.log(licenseKey)
        console.log('\n=== DETAILS ===')
        console.log(summary)
    }
}

const [, , subcommand, ...rest] = process.argv
if (subcommand === 'init') {
    cmdInit()
} else if (subcommand === 'issue') {
    const tier = rest[0]
    cmdIssue(tier, rest.slice(1))
} else {
    console.log(USAGE)
    process.exit(subcommand ? 1 : 0)
}

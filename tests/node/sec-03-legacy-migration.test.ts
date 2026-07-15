import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCipheriv, randomBytes, createHash } from 'crypto'

const store = new Map<string, string>()

vi.mock('better-sqlite3-multiple-ciphers', () => {
    class FakeDb {
        pragma(): void {}
        exec(): void {}
        prepare(sql: string): unknown {
            if (sql.includes('SELECT version FROM _migrations')) {
                return { all: (): unknown[] => [] }
            }
            if (sql.includes('INSERT INTO _migrations')) {
                return { run: (): void => {} }
            }
            if (sql.startsWith('SELECT value FROM settings')) {
                return {
                    get: (key: string): { value: string } | undefined => {
                        const v = store.get(key)
                        return v === undefined ? undefined : { value: v }
                    },
                }
            }
            if (sql.startsWith('SELECT key, value FROM settings')) {
                return {
                    all: (): Array<{ key: string; value: string }> =>
                        Array.from(store.entries()).map(([key, value]) => ({ key, value })),
                }
            }
            if (sql.includes('INSERT INTO settings')) {
                return {
                    run: (params: { key: string; value: string }): void => {
                        store.set(params.key, params.value)
                    },
                }
            }
            return { run: (): void => {}, get: (): undefined => undefined, all: (): unknown[] => [] }
        }
        transaction(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
            return fn
        }
        close(): void {}
    }
    return { default: FakeDb }
})

vi.mock('@main/services/backup', () => ({
    startAutoBackup: (): void => {},
    stopAutoBackup: (): void => {},
    restoreFromBackup: (): boolean => false,
    backupDatabase: (): void => {},
    setBackupSource: (): void => {},
}))

vi.mock('@main/services/db-key', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@main/services/db-key')>()
    return {
        ...actual,
        getDbKey: (): Buffer => Buffer.alloc(32, 1),
        provisionDbKey: (): Buffer => Buffer.alloc(32, 1),
    }
})

const MACHINE_ID = 'fixed-machine-id'
vi.mock('@main/services/machine-id', () => ({
    machineIdSync: (): string => MACHINE_ID,
}))

import { configureEncryption, encrypt, CIPHERTEXT_VERSION } from '@main/services/encryption'
import { DatabaseService } from '@main/services/database'

const MASTER = Buffer.alloc(32, 7)
const SALT = Buffer.alloc(16, 9)

function legacyEncrypt(plaintext: string, machineId: string): string {
    const key = createHash('sha256').update(`${machineId}:fortis-encryption-salt-v1`).digest()
    let iv: Buffer
    do {
        iv = randomBytes(16)
    } while (iv[0] === CIPHERTEXT_VERSION)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]).toString('base64')
}

describe('SEC-03/SEC-07 legacy migration distinguishes corrupt v2 from genuine legacy', () => {
    beforeEach(() => {
        store.clear()
        configureEncryption({ masterKey: MASTER, salt: SALT })
    })

    it('genuine legacy machine-id ciphertext is migrated to v2 and decrypts', () => {
        store.set('licenseKey', legacyEncrypt('legacy-license', MACHINE_ID))

        const db = new DatabaseService('/tmp/fortis-migrate.db')

        const stored = store.get('licenseKey')!
        expect(Buffer.from(stored, 'base64')[0]).toBe(CIPHERTEXT_VERSION)
        expect(db.getSetting('licenseKey')).toBe('legacy-license')
    })

    it('corrupt v2 ciphertext surfaces (is NOT re-encrypted from garbage)', () => {
        const good = encrypt('valid-secret')
        const buf = Buffer.from(good, 'base64')
        buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff
        const corrupt = buf.toString('base64')
        store.set('licenseKey', corrupt)

        const db = new DatabaseService('/tmp/fortis-migrate.db')

        expect(store.get('licenseKey')).toBe(corrupt)
        expect(Buffer.from(store.get('licenseKey')!, 'base64')[0]).toBe(CIPHERTEXT_VERSION)
    })

    it('surfaces a migration summary counting migrated and remaining keys', () => {
        store.set('licenseKey', legacyEncrypt('legacy-license', MACHINE_ID))
        const good = encrypt('valid-secret')
        const buf = Buffer.from(good, 'base64')
        buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff
        store.set('openaiApiKey', buf.toString('base64'))

        const db = new DatabaseService('/tmp/fortis-migrate.db')

        const summary = db.getLegacyMigrationSummary()
        expect(summary).not.toBeNull()
        expect(summary!.migrated).toBe(1)
        expect(summary!.remaining).toBe(1)
    })

    it('returns null summary when there is nothing to migrate', () => {
        const db = new DatabaseService('/tmp/fortis-migrate.db')
        expect(db.getLegacyMigrationSummary()).toBeNull()
    })
})

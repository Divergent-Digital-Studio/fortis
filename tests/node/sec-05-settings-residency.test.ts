import { describe, it, expect, vi, beforeEach } from 'vitest'

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
        backup(): Promise<void> {
            return Promise.resolve()
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

import * as encryptionModule from '@main/services/encryption'
import { configureEncryption, encrypt, CIPHERTEXT_VERSION } from '@main/services/encryption'
import { DatabaseService } from '@main/services/database'

describe('SEC-05 no false disposable-key abstraction', () => {
    it('encryption module does not export decryptApiKey (false retention guarantee removed)', () => {
        expect((encryptionModule as Record<string, unknown>).decryptApiKey).toBeUndefined()
    })

    it('providers decrypt on demand via getSetting and do not retain a module-level plaintext store', () => {
        store.clear()
        configureEncryption({ masterKey: Buffer.alloc(32, 7), salt: Buffer.alloc(16, 9) })
        const db = new DatabaseService('/tmp/fortis-test.db')
        db.setSetting('openaiApiKey', 'sk-abcdefghijklmnopqrstuvwxyz123456')

        const first = db.getSetting('openaiApiKey')
        db.setSetting('openaiApiKey', 'sk-zzzzzzzzzzzzzzzzzzzzzzzzzzzz9999')
        const second = db.getSetting('openaiApiKey')

        expect(first).toBe('sk-abcdefghijklmnopqrstuvwxyz123456')
        expect(second).toBe('sk-zzzzzzzzzzzzzzzzzzzzzzzzzzzz9999')
    })
})

describe('SEC-05 sensitive-key writes are always encrypted', () => {
    beforeEach(() => {
        store.clear()
        configureEncryption({ masterKey: Buffer.alloc(32, 7), salt: Buffer.alloc(16, 9) })
    })

    it('a long non-key licenseKey is stored encrypted (stored bytes != plaintext) and decrypts back', () => {
        const db = new DatabaseService('/tmp/fortis-test.db')
        const license = 'FORTISLICENSEVALUE1234567890ABCDEFGHIJKLMNOP'
        db.setSetting('licenseKey', license)

        const stored = store.get('licenseKey')!
        expect(stored).not.toBe(license)
        expect(stored).not.toBe(JSON.stringify(license))
        expect(Buffer.from(stored, 'base64')[0]).toBe(CIPHERTEXT_VERSION)

        expect(db.getSetting('licenseKey')).toBe(license)
    })

    it('writing an already-valid v2 ciphertext for a sensitive key is not double-encrypted', () => {
        const db = new DatabaseService('/tmp/fortis-test.db')
        const v2 = encrypt('already-ciphertext')
        db.setEncryptedSetting('licenseKey', v2)
        const storedBefore = store.get('licenseKey')!

        db.setSetting('licenseKey', v2)
        const storedAfter = store.get('licenseKey')!

        expect(storedAfter).toBe(storedBefore)
        expect(db.getSetting('licenseKey')).toBe('already-ciphertext')
    })
})

describe('SEC-05 sensitive keys masked in getAllSettings', () => {
    beforeEach(() => {
        store.clear()
        configureEncryption({ masterKey: Buffer.alloc(32, 7), salt: Buffer.alloc(16, 9) })
    })

    it('getAllSettings masks SENSITIVE_KEYS and never returns plaintext or ciphertext', () => {
        const db = new DatabaseService('/tmp/fortis-test.db')
        const plaintext = 'sk-ant-abcdefghijklmnopqrstuvwxyz'
        db.setSetting('anthropicApiKey', plaintext)

        const storedCiphertext = store.get('anthropicApiKey')!
        expect(storedCiphertext).not.toBe(plaintext)

        const all = db.getAllSettings()
        expect(all.anthropicApiKey).not.toBe(plaintext)
        expect(all.anthropicApiKey).not.toBe(storedCiphertext)
        expect(all.anthropicApiKey).toBe('')
    })

    it('providers still read the real key via getSetting on demand', () => {
        const db = new DatabaseService('/tmp/fortis-test.db')
        const plaintext = 'sk-ant-abcdefghijklmnopqrstuvwxyz'
        db.setSetting('anthropicApiKey', plaintext)

        const single = db.getSetting('anthropicApiKey')
        expect(single).toBe(plaintext)
    })

    it('getAllSettings never returns raw ciphertext for any sensitive key', () => {
        const db = new DatabaseService('/tmp/fortis-test.db')
        db.setSetting('openaiApiKey', 'sk-abcdefghijklmnopqrstuvwxyz123456')
        db.setSetting('anthropicApiKey', 'sk-ant-abcdefghijklmnopqrstuvwxyz')
        db.setSetting('licenseKey', 'FORTIS-LICENSE-VALUE-1234567890-ABCDEFGH')

        const all = db.getAllSettings() as Record<string, unknown>
        for (const key of ['openaiApiKey', 'anthropicApiKey', 'licenseKey']) {
            const stored = store.get(key)
            expect(all[key]).not.toBe(stored)
            expect(all[key]).toBe('')
        }
    })
})

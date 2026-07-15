import { describe, it, expect, beforeEach } from 'vitest'
import {
    getOrCreateSecret,
    decideDbMigration,
    dbKeyToPassphrase,
    assertHexPassphrase,
    KEY_FILE_MODE,
    type SafeStorageLike,
    type FileStoreLike,
} from '@main/services/db-key'

function makeFakeFileStore(): FileStoreLike & { files: Map<string, Buffer>; modes: Map<string, number> } {
    const files = new Map<string, Buffer>()
    const modes = new Map<string, number>()
    return {
        files,
        modes,
        exists(path: string): boolean {
            return files.has(path)
        },
        readFile(path: string): Buffer {
            const data = files.get(path)
            if (!data) throw new Error(`ENOENT: ${path}`)
            return data
        },
        writeFile(path: string, data: Buffer, mode?: number): void {
            files.set(path, Buffer.from(data))
            if (mode !== undefined) modes.set(path, mode)
        },
    }
}

function makeFakeSafeStorage(available: boolean): SafeStorageLike {
    const MAGIC = Buffer.from('SS:')
    const XOR = 0x5a
    return {
        isEncryptionAvailable(): boolean {
            return available
        },
        encryptString(plaintext: string): Buffer {
            const obscured = Buffer.from(plaintext, 'utf8').map((b) => b ^ XOR)
            return Buffer.concat([MAGIC, obscured])
        },
        decryptString(encrypted: Buffer): string {
            if (!encrypted.subarray(0, MAGIC.length).equals(MAGIC)) {
                throw new Error('not safeStorage payload')
            }
            const obscured = Buffer.from(encrypted.subarray(MAGIC.length))
            return Buffer.from(obscured.map((b) => b ^ XOR)).toString('utf8')
        },
    }
}

describe('SEC-04 passphrase hex-literal guard (defense against SQL injection)', () => {
    it('a real 32-byte key produces a passphrase that passes the hex guard', () => {
        const passphrase = dbKeyToPassphrase(Buffer.alloc(32, 0xab))
        expect(passphrase).toHaveLength(64)
        expect(assertHexPassphrase(passphrase)).toBe(passphrase)
    })

    it('throws on a passphrase containing SQL-breaking characters', () => {
        expect(() => assertHexPassphrase("abcd' OR '1'='1")).toThrow()
    })

    it('throws on wrong-length or uppercase/non-hex passphrases', () => {
        expect(() => assertHexPassphrase('a'.repeat(63))).toThrow()
        expect(() => assertHexPassphrase('a'.repeat(65))).toThrow()
        expect(() => assertHexPassphrase('A'.repeat(64))).toThrow()
        expect(() => assertHexPassphrase('g'.repeat(64))).toThrow()
        expect(() => assertHexPassphrase('')).toThrow()
    })
})

describe('SEC-04/SEC-03 db-key secret management', () => {
    let fileStore: ReturnType<typeof makeFakeFileStore>

    beforeEach(() => {
        fileStore = makeFakeFileStore()
    })

    it('generates a random 32-byte secret on first call and persists it', () => {
        const safeStorage = makeFakeSafeStorage(true)
        const secret = getOrCreateSecret('db-passphrase', { safeStorage, fileStore, dir: '/u' })

        expect(secret).toBeInstanceOf(Buffer)
        expect(secret.length).toBe(32)
        expect(fileStore.files.size).toBe(1)
    })

    it('returns the same secret on subsequent calls (stable across restarts)', () => {
        const safeStorage = makeFakeSafeStorage(true)
        const first = getOrCreateSecret('db-passphrase', { safeStorage, fileStore, dir: '/u' })
        const second = getOrCreateSecret('db-passphrase', { safeStorage, fileStore, dir: '/u' })

        expect(second.equals(first)).toBe(true)
    })

    it('persists the secret wrapped by safeStorage, never in plaintext, when available', () => {
        const safeStorage = makeFakeSafeStorage(true)
        const secret = getOrCreateSecret('db-passphrase', { safeStorage, fileStore, dir: '/u' })

        const stored = Array.from(fileStore.files.values())[0]!
        expect(stored.includes(secret)).toBe(false)
        expect(stored.subarray(0, 3).toString()).toBe('SS:')
    })

    it('different secret names yield non-equal independent secrets', () => {
        const safeStorage = makeFakeSafeStorage(true)
        const a = getOrCreateSecret('db-passphrase', { safeStorage, fileStore, dir: '/u' })
        const b = getOrCreateSecret('master-key', { safeStorage, fileStore, dir: '/u' })

        expect(a.equals(b)).toBe(false)
    })

    it('falls back to a 0600 key file when safeStorage is unavailable, never reverting to machine-id', () => {
        const safeStorage = makeFakeSafeStorage(false)
        const secret = getOrCreateSecret('master-key', { safeStorage, fileStore, dir: '/u' })

        expect(secret.length).toBe(32)
        const path = Array.from(fileStore.files.keys())[0]!
        expect(fileStore.modes.get(path)).toBe(KEY_FILE_MODE)
    })

    it('reads back a fallback-stored secret stably', () => {
        const safeStorage = makeFakeSafeStorage(false)
        const first = getOrCreateSecret('master-key', { safeStorage, fileStore, dir: '/u' })
        const second = getOrCreateSecret('master-key', { safeStorage, fileStore, dir: '/u' })

        expect(second.equals(first)).toBe(true)
    })
})

describe('SEC-04 db migration decision', () => {
    it('migrates when a plaintext db exists', () => {
        const decision = decideDbMigration({ dbExists: true, isPlaintext: true })
        expect(decision.action).toBe('migrate-plaintext')
    })

    it('opens directly when an existing db is already encrypted', () => {
        const decision = decideDbMigration({ dbExists: true, isPlaintext: false })
        expect(decision.action).toBe('open-encrypted')
    })

    it('creates a fresh encrypted db when none exists', () => {
        const decision = decideDbMigration({ dbExists: false, isPlaintext: false })
        expect(decision.action).toBe('create-encrypted')
    })
})

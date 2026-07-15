import { randomBytes } from 'crypto'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, openSync, readSync, closeSync } from 'fs'

const KEY_FILE_MODE = 0o600
const SECRET_LENGTH = 32
const PLAINTEXT_PREFIX = Buffer.from('FORTIS-PLAINTEXT-V1\n')
const SQLITE_HEADER = Buffer.from('SQLite format 3\x00', 'latin1')

const DB_KEY_NAME = 'db-passphrase'
const MASTER_KEY_NAME = 'master-key'
const ENCRYPTION_SALT_NAME = 'encryption-salt'

interface SafeStorageLike {
    isEncryptionAvailable(): boolean
    encryptString(plaintext: string): Buffer
    decryptString(encrypted: Buffer): string
}

interface FileStoreLike {
    exists(path: string): boolean
    readFile(path: string): Buffer
    writeFile(path: string, data: Buffer, mode?: number): void
}

interface SecretOptions {
    safeStorage: SafeStorageLike
    fileStore: FileStoreLike
    dir: string
}

type DbMigrationAction = 'create-encrypted' | 'open-encrypted' | 'migrate-plaintext'

interface DbMigrationDecision {
    action: DbMigrationAction
}

interface DbMigrationContext {
    dbExists: boolean
    isPlaintext: boolean
}

function secretFilePath(dir: string, name: string): string {
    return join(dir, `.${name}.key`)
}

function wrapSecret(secret: Buffer, safeStorage: SafeStorageLike): Buffer {
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(secret.toString('base64'))
    }
    return Buffer.concat([PLAINTEXT_PREFIX, secret])
}

function unwrapSecret(stored: Buffer, safeStorage: SafeStorageLike): Buffer {
    if (stored.subarray(0, PLAINTEXT_PREFIX.length).equals(PLAINTEXT_PREFIX)) {
        return Buffer.from(stored.subarray(PLAINTEXT_PREFIX.length))
    }
    const base64 = safeStorage.decryptString(stored)
    return Buffer.from(base64, 'base64')
}

function getOrCreateSecret(name: string, options: SecretOptions): Buffer {
    const path = secretFilePath(options.dir, name)

    if (options.fileStore.exists(path)) {
        const stored = options.fileStore.readFile(path)
        const secret = unwrapSecret(stored, options.safeStorage)
        if (secret.length === SECRET_LENGTH) {
            return secret
        }
    }

    const secret = randomBytes(SECRET_LENGTH)
    const wrapped = wrapSecret(secret, options.safeStorage)
    options.fileStore.writeFile(path, wrapped, KEY_FILE_MODE)
    return secret
}

function provisionDbKey(options: SecretOptions): Buffer {
    return getOrCreateSecret(DB_KEY_NAME, options)
}

function provisionMasterKey(options: SecretOptions): Buffer {
    return getOrCreateSecret(MASTER_KEY_NAME, options)
}

function provisionEncryptionSalt(options: SecretOptions): Buffer {
    return getOrCreateSecret(ENCRYPTION_SALT_NAME, options)
}

function decideDbMigration(context: DbMigrationContext): DbMigrationDecision {
    if (!context.dbExists) {
        return { action: 'create-encrypted' }
    }
    if (context.isPlaintext) {
        return { action: 'migrate-plaintext' }
    }
    return { action: 'open-encrypted' }
}

function isPlaintextSqliteFile(path: string): boolean {
    if (!existsSync(path)) {
        return false
    }
    const fd = openSync(path, 'r')
    try {
        const header = Buffer.alloc(SQLITE_HEADER.length)
        const bytesRead = readSync(fd, header, 0, header.length, 0)
        if (bytesRead < SQLITE_HEADER.length) {
            return false
        }
        return header.equals(SQLITE_HEADER)
    } finally {
        closeSync(fd)
    }
}

function nodeFileStore(): FileStoreLike {
    return {
        exists(path: string): boolean {
            return existsSync(path)
        },
        readFile(path: string): Buffer {
            return readFileSync(path)
        },
        writeFile(path: string, data: Buffer, mode?: number): void {
            writeFileSync(path, data, mode !== undefined ? { mode } : undefined)
        },
    }
}

function provisionSecrets(
    safeStorage: SafeStorageLike,
    dir: string,
): { dbKey: Buffer; masterKey: Buffer } {
    const options: SecretOptions = { safeStorage, fileStore: nodeFileStore(), dir }
    return {
        dbKey: provisionDbKey(options),
        masterKey: provisionMasterKey(options),
    }
}

function dbKeyToPassphrase(key: Buffer): string {
    return key.toString('hex')
}

const HEX_PASSPHRASE_PATTERN = /^[0-9a-f]{64}$/

function assertHexPassphrase(passphrase: string): string {
    if (!HEX_PASSPHRASE_PATTERN.test(passphrase)) {
        throw new Error('Database passphrase must be 64 lowercase hex characters')
    }
    return passphrase
}

function loadSafeStorage(): SafeStorageLike {
    const electron = require('electron') as { safeStorage: SafeStorageLike }
    return electron.safeStorage
}

function getDbKey(dir: string): Buffer {
    return provisionDbKey({ safeStorage: loadSafeStorage(), fileStore: nodeFileStore(), dir })
}

function getMasterKey(dir: string): Buffer {
    return provisionMasterKey({ safeStorage: loadSafeStorage(), fileStore: nodeFileStore(), dir })
}

function getEncryptionConfig(dir: string): { masterKey: Buffer; salt: Buffer } {
    const options: SecretOptions = { safeStorage: loadSafeStorage(), fileStore: nodeFileStore(), dir }
    return {
        masterKey: provisionMasterKey(options),
        salt: provisionEncryptionSalt(options),
    }
}

export {
    getOrCreateSecret,
    provisionDbKey,
    provisionMasterKey,
    provisionEncryptionSalt,
    provisionSecrets,
    getDbKey,
    getMasterKey,
    getEncryptionConfig,
    decideDbMigration,
    isPlaintextSqliteFile,
    dbKeyToPassphrase,
    assertHexPassphrase,
    nodeFileStore,
    secretFilePath,
    KEY_FILE_MODE,
    SECRET_LENGTH,
}

export type {
    SafeStorageLike,
    FileStoreLike,
    SecretOptions,
    DbMigrationAction,
    DbMigrationDecision,
    DbMigrationContext,
}

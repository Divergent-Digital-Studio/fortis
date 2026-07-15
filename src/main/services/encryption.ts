import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'crypto'
import { SENSITIVE_SETTING_KEYS } from '../../shared/types/settings'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const LEGACY_IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const CIPHERTEXT_VERSION = 0x02

const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const
const LEGACY_STATIC_SALT = 'fortis-encryption-salt-v1'

interface EncryptionConfig {
    masterKey: Buffer
    salt: Buffer
}

let activeKey: Buffer | null = null

function deriveEncryptionKey(masterKey: Buffer, salt: Buffer): Buffer {
    return scryptSync(masterKey, salt, 32, SCRYPT_PARAMS)
}

function configureEncryption(config: EncryptionConfig): void {
    activeKey = deriveEncryptionKey(config.masterKey, config.salt)
}

function getKey(): Buffer {
    if (!activeKey) {
        throw new Error('Encryption not configured')
    }
    return activeKey
}

function legacyMachineKeyFrom(machineId: string): Buffer {
    return createHash('sha256').update(`${machineId}:${LEGACY_STATIC_SALT}`).digest()
}

function encryptWithKey(plaintext: string, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    const payload = Buffer.concat([
        Buffer.from([CIPHERTEXT_VERSION]),
        iv,
        authTag,
        Buffer.from(encrypted, 'hex'),
    ])

    return payload.toString('base64')
}

function decryptVersioned(payload: Buffer, key: Buffer): string {
    const iv = payload.subarray(1, 1 + IV_LENGTH)
    const authTag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH)
    const encryptedData = payload.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedData.toString('hex'), 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}

function decryptLegacy(payload: Buffer, key: Buffer): string {
    const iv = payload.subarray(0, LEGACY_IV_LENGTH)
    const authTag = payload.subarray(LEGACY_IV_LENGTH, LEGACY_IV_LENGTH + AUTH_TAG_LENGTH)
    const encryptedData = payload.subarray(LEGACY_IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedData.toString('hex'), 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}

function decryptWithKey(ciphertext: string, key: Buffer): string {
    const payload = Buffer.from(ciphertext, 'base64')

    if (payload[0] === CIPHERTEXT_VERSION) {
        if (payload.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH) {
            throw new Error('Invalid ciphertext: versioned payload too short')
        }
        return decryptVersioned(payload, key)
    }

    if (payload.length < LEGACY_IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('Invalid ciphertext: too short')
    }

    return decryptLegacy(payload, key)
}

function encrypt(plaintext: string): string {
    return encryptWithKey(plaintext, getKey())
}

function decrypt(ciphertext: string): string {
    return decryptWithKey(ciphertext, getKey())
}

function reEncryptFromLegacy(ciphertext: string, machineId: string): string {
    const legacyKey = legacyMachineKeyFrom(machineId)
    const plaintext = decryptWithKey(ciphertext, legacyKey)
    return encrypt(plaintext)
}

function isVersionedCiphertext(value: string): boolean {
    if (!value || typeof value !== 'string') return false

    try {
        const payload = Buffer.from(value, 'base64')
        return payload[0] === CIPHERTEXT_VERSION && payload.length >= 1 + IV_LENGTH + AUTH_TAG_LENGTH
    } catch {
        return false
    }
}

function isEncrypted(value: string): boolean {
    if (!value || typeof value !== 'string') return false

    if (value.startsWith('sk-')) return false

    try {
        const payload = Buffer.from(value, 'base64')
        if (payload[0] === CIPHERTEXT_VERSION && payload.length >= 1 + IV_LENGTH + AUTH_TAG_LENGTH) {
            return true
        }
        return payload.length >= LEGACY_IV_LENGTH + AUTH_TAG_LENGTH
    } catch {
        return false
    }
}

const API_KEY_PATTERNS: Record<string, RegExp> = {
    openai: /^sk-(?!ant-)[a-zA-Z0-9_-]{20,}$/,
    anthropic: /^sk-ant-[a-zA-Z0-9_-]{20,}$/,
}

function isApiKeyFormat(key: string, provider?: string): boolean {
    if (!key || key.length < 10) return false

    if (provider && API_KEY_PATTERNS[provider]) {
        return API_KEY_PATTERNS[provider]!.test(key)
    }

    return Object.values(API_KEY_PATTERNS).some(pattern => pattern.test(key))
}

function encryptApiKey(key: string, provider?: string): string {
    if (!key || key.trim().length === 0) {
        throw new Error('API key cannot be empty')
    }

    if (provider && !isApiKeyFormat(key, provider)) {
        throw new Error(`Invalid ${provider} API key format`)
    }

    return encrypt(key)
}

function clearSensitiveString(target: Record<string, unknown>, key: string): void {
    if (typeof target[key] === 'string') {
        target[key] = ''
    }
}

const SENSITIVE_SETTING_FIELDS = SENSITIVE_SETTING_KEYS

function sanitizeSettingsForIpc(settings: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...settings }
    const sensitiveFields = SENSITIVE_SETTING_FIELDS

    for (const field of sensitiveFields) {
        if (typeof sanitized[field] === 'string' && (sanitized[field] as string).length > 0) {
            sanitized[field] = '••••••••'
        }
    }

    return sanitized
}

function sanitizeForLogging(input: string): string {
    let result = input
    for (const pattern of Object.values(API_KEY_PATTERNS)) {
        result = result.replace(pattern, '[REDACTED]')
    }
    return result
}

export {
    encrypt,
    decrypt,
    isEncrypted,
    isVersionedCiphertext,
    encryptApiKey,
    clearSensitiveString,
    isApiKeyFormat,
    sanitizeSettingsForIpc,
    sanitizeForLogging,
    configureEncryption,
    deriveEncryptionKey,
    legacyMachineKeyFrom,
    reEncryptFromLegacy,
    CIPHERTEXT_VERSION,
    IV_LENGTH,
}

export type { EncryptionConfig }

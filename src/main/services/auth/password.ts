import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPassword(password: string): { hash: string; salt: string } {
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(password, salt, 64).toString('hex')
    return { hash, salt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    if (candidate.length !== expected.length) return false
    return timingSafeEqual(candidate, expected)
}

export function generateToken(): string {
    return randomBytes(32).toString('hex')
}

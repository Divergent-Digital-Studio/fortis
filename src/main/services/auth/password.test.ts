import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generateToken } from './password'

describe('password', () => {
    it('verifies a correct password and rejects a wrong one', () => {
        const { hash, salt } = hashPassword('s3cret!')
        expect(verifyPassword('s3cret!', hash, salt)).toBe(true)
        expect(verifyPassword('wrong', hash, salt)).toBe(false)
    })
    it('uses a unique salt per call', () => {
        const a = hashPassword('x')
        const b = hashPassword('x')
        expect(a.salt).not.toBe(b.salt)
        expect(a.hash).not.toBe(b.hash)
    })
    it('generates a 64-hex-char token', () => {
        expect(generateToken()).toMatch(/^[0-9a-f]{64}$/)
    })
})

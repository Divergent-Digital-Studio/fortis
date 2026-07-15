import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationsDir = resolve(__dirname, '../../src/main/services/migrations')

describe('DB-01 single schema source of truth', () => {
    it('no unreferenced *.sql migration files exist on disk', () => {
        if (!existsSync(migrationsDir)) {
            expect(existsSync(migrationsDir)).toBe(false)
            return
        }

        const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
        expect(sqlFiles).toEqual([])
    })
})

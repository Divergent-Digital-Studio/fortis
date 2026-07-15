import { describe, it, expect } from 'vitest'
import {
    planBackup,
    planRestore,
    walPath,
    shmPath,
    isSafeBackupPath,
    assertSafeBackupPath,
    quoteSqlPath,
} from '@main/services/db/backup-plan'
import { decideRecovery, quarantinePathFor } from '@main/services/db/recovery-plan'

describe('DB-04 backup planning produces an encrypted, keyed artifact', () => {
    it('plans an encrypted copy via VACUUM INTO that requires the key, never a plaintext copy', () => {
        const plan = planBackup('/data/fortis.db', '/data/fortis-backup.db')
        expect(plan.method).toBe('vacuum-into')
        expect(plan.requiresKey).toBe(true)
        expect(plan.producesEncryptedArtifact).toBe(true)
        expect(plan.requiresCheckpoint).toBe(true)
    })

    it('enumerates the -wal and -shm sidecars for the source db', () => {
        const plan = planBackup('/data/fortis.db', '/data/fortis-backup.db')
        expect(plan.sidecarPaths).toContain('/data/fortis.db-wal')
        expect(plan.sidecarPaths).toContain('/data/fortis.db-shm')
        expect(plan.targetPath).toBe('/data/fortis-backup.db')
    })

    it('restore requires the key and clears stale sidecars so a torn WAL is not resurrected', () => {
        const plan = planRestore('/data/fortis-backup.db', '/data/fortis.db')
        expect(plan.sourcePath).toBe('/data/fortis-backup.db')
        expect(plan.targetPath).toBe('/data/fortis.db')
        expect(plan.requiresKey).toBe(true)
        expect(plan.staleSidecarPaths).toContain('/data/fortis.db-wal')
        expect(plan.staleSidecarPaths).toContain('/data/fortis.db-shm')
    })

    it('sidecar path helpers', () => {
        expect(walPath('/x/a.db')).toBe('/x/a.db-wal')
        expect(shmPath('/x/a.db')).toBe('/x/a.db-shm')
    })
})

describe('DB-04 backup path validation prevents SQL injection in VACUUM INTO / ATTACH', () => {
    it('accepts ordinary backup paths, including real macOS paths with spaces', () => {
        expect(isSafeBackupPath('/data/fortis-backup.db')).toBe(true)
        expect(assertSafeBackupPath('/data/fortis-backup.db')).toBe('/data/fortis-backup.db')
        expect(isSafeBackupPath('/Users/x/Library/Application Support/fortis/fortis-backup.db')).toBe(true)
    })

    it('rejects paths containing a single quote that would break the inline SQL literal', () => {
        expect(isSafeBackupPath("/data/a'; DROP TABLE alerts;--.db")).toBe(false)
        expect(() => assertSafeBackupPath("/data/a'; DROP TABLE alerts;--.db")).toThrow()
        expect(() => planBackup('/data/fortis.db', "/data/a'.db")).toThrow()
    })

    it('rejects empty paths and embedded control characters', () => {
        expect(isSafeBackupPath('')).toBe(false)
        expect(isSafeBackupPath('/data/back\nup.db')).toBe(false)
        expect(isSafeBackupPath('/data/back\0up.db')).toBe(false)
    })

    it('quotes a validated path for inline SQL', () => {
        expect(quoteSqlPath('/data/fortis-backup.db')).toBe("'/data/fortis-backup.db'")
        expect(() => quoteSqlPath("/data/evil'.db")).toThrow()
    })
})

describe('DB-05 corrupt-db recovery decision', () => {
    it('recovers from backup when a backup was restored', () => {
        const decision = decideRecovery({ dbPath: '/data/fortis.db', backupRestored: true, now: 123 })
        expect(decision.action).toBe('recover-from-backup')
    })

    it('quarantines and recreates when NO backup exists (no guaranteed crash)', () => {
        const decision = decideRecovery({ dbPath: '/data/fortis.db', backupRestored: false, now: 123 })
        expect(decision.action).toBe('quarantine-and-recreate')
        expect(decision.quarantinePath).toBe('/data/fortis.db.corrupt-123')
    })

    it('quarantine path is timestamped and unique', () => {
        expect(quarantinePathFor('/a.db', 1)).toBe('/a.db.corrupt-1')
        expect(quarantinePathFor('/a.db', 2)).not.toBe(quarantinePathFor('/a.db', 1))
    })
})

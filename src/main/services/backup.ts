import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { existsSync, statSync, unlinkSync, renameSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { planBackup, planRestore, quoteSqlPath, assertSafeBackupPath } from './db/backup-plan'
import { assertHexPassphrase } from './db-key'

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000
const MAX_BACKUP_COUNT = 3

interface BackupState {
    lastBackupTimestamp: number
    backupTimer: ReturnType<typeof setInterval> | null
    db: DatabaseType | null
    dbPath: string | null
    passphrase: string | null
}

const state: BackupState = {
    lastBackupTimestamp: 0,
    backupTimer: null,
    db: null,
    dbPath: null,
    passphrase: null,
}

interface SchemaTableRow {
    name: string
    sql: string
}

function getBackupPath(dbPath: string, index: number): string {
    const dir = dirname(dbPath)
    const suffix = index === 0 ? '' : `.${index}`
    return join(dir, `fortis-backup${suffix}.db`)
}

function clearSidecars(dbPath: string): void {
    const plan = planRestore(getBackupPath(dbPath, 0), dbPath)
    for (const sidecar of plan.staleSidecarPaths) {
        if (existsSync(sidecar)) {
            try {
                unlinkSync(sidecar)
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                console.error(`[Backup] Failed to clear stale sidecar ${sidecar}: ${reason}`)
            }
        }
    }
}

function rotateBackups(dbPath: string): void {
    for (let i = MAX_BACKUP_COUNT - 1; i > 0; i--) {
        const current = getBackupPath(dbPath, i - 1)
        const next = getBackupPath(dbPath, i)

        if (existsSync(next)) {
            try {
                unlinkSync(next)
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                console.error(`[Backup] Failed to remove rotated backup ${next}: ${reason}`)
            }
        }

        if (existsSync(current)) {
            try {
                renameSync(current, next)
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                console.error(`[Backup] Failed to rotate backup ${current} -> ${next}: ${reason}`)
            }
        }
    }
}

function removeStaleBackupArtifacts(targetPath: string): void {
    for (const artifact of [targetPath, `${targetPath}-wal`, `${targetPath}-shm`]) {
        if (existsSync(artifact)) {
            unlinkSync(artifact)
        }
    }
}

function backupViaAttachExport(db: DatabaseType, passphrase: string, targetPath: string): void {
    const quotedTarget = quoteSqlPath(targetPath)
    db.exec(`ATTACH DATABASE ${quotedTarget} AS fortis_backup KEY '${assertHexPassphrase(passphrase)}'`)

    try {
        const tables = db
            .prepare(
                "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as SchemaTableRow[]

        const indexes = db
            .prepare(
                "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL",
            )
            .all() as SchemaTableRow[]

        const copyAll = db.transaction(() => {
            for (const table of tables) {
                db.exec(table.sql.replace(/^CREATE TABLE /i, 'CREATE TABLE fortis_backup.'))
                db.exec(`INSERT INTO fortis_backup."${table.name}" SELECT * FROM main."${table.name}"`)
            }
            for (const index of indexes) {
                db.exec(index.sql.replace(/^CREATE (UNIQUE )?INDEX /i, 'CREATE $1INDEX fortis_backup.'))
            }
        })

        copyAll()
    } finally {
        db.exec('DETACH DATABASE fortis_backup')
    }
}

function isEncryptedArtifact(targetPath: string, passphrase: string): boolean {
    let probe: DatabaseType | null = null
    try {
        probe = new Database(targetPath, { readonly: true })
        probe.pragma("cipher='sqlcipher'")
        probe.pragma(`key='${assertHexPassphrase(passphrase)}'`)
        probe.prepare('SELECT count(*) AS c FROM sqlite_master').get()
        return true
    } catch {
        return false
    } finally {
        if (probe) {
            probe.close()
        }
    }
}

function backupDatabase(db: DatabaseType, dbPath: string, backupPath: string, passphrase: string): void {
    const plan = planBackup(dbPath, backupPath)

    db.pragma('wal_checkpoint(TRUNCATE)')

    removeStaleBackupArtifacts(plan.targetPath)

    try {
        db.exec(`VACUUM INTO ${quoteSqlPath(plan.targetPath)}`)
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`[Backup] VACUUM INTO failed, falling back to ATTACH export: ${reason}`)
        removeStaleBackupArtifacts(plan.targetPath)
        backupViaAttachExport(db, passphrase, plan.targetPath)
    }

    if (!isEncryptedArtifact(plan.targetPath, passphrase)) {
        removeStaleBackupArtifacts(plan.targetPath)
        throw new Error(`Backup artifact at ${plan.targetPath} is not an encrypted, readable database`)
    }
}

function createBackup(): boolean {
    if (!state.db || !state.dbPath || !state.passphrase) return false
    if (!existsSync(state.dbPath)) return false

    try {
        rotateBackups(state.dbPath)
        backupDatabase(state.db, state.dbPath, getBackupPath(state.dbPath, 0), state.passphrase)
        state.lastBackupTimestamp = Date.now()
        return true
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`[Backup] Failed to create backup: ${reason}`)
        return false
    }
}

function shouldBackup(): boolean {
    if (state.lastBackupTimestamp === 0) return true
    return Date.now() - state.lastBackupTimestamp >= BACKUP_INTERVAL_MS
}

function performBackupIfNeeded(): boolean {
    if (!shouldBackup()) return false
    return createBackup()
}

function setBackupSource(db: DatabaseType, dbPath: string, passphrase: string): void {
    state.db = db
    state.dbPath = dbPath
    state.passphrase = passphrase
}

function startAutoBackup(dbPath: string): void {
    stopAutoBackup()

    state.dbPath = dbPath

    performBackupIfNeeded()

    state.backupTimer = setInterval(() => {
        performBackupIfNeeded()
    }, 60 * 60 * 1000)

    if (state.backupTimer.unref) {
        state.backupTimer.unref()
    }
}

function stopAutoBackup(): void {
    if (state.backupTimer) {
        clearInterval(state.backupTimer)
        state.backupTimer = null
    }
}

function restoreFromBackup(dbPath: string, passphrase: string): boolean {
    for (let i = 0; i < MAX_BACKUP_COUNT; i++) {
        const backupPath = getBackupPath(dbPath, i)
        if (!existsSync(backupPath)) continue

        try {
            const stats = statSync(backupPath)
            if (stats.size === 0) continue

            if (!isEncryptedArtifact(backupPath, passphrase)) {
                console.error(`[Backup] Backup ${backupPath} is not a valid encrypted database, skipping`)
                continue
            }

            const plan = planRestore(backupPath, dbPath)

            if (existsSync(dbPath)) {
                const corruptPath = `${dbPath}.corrupt`
                try {
                    renameSync(dbPath, corruptPath)
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error)
                    console.error(`[Backup] Failed to move corrupt db aside before restore: ${reason}`)
                }
            }

            clearSidecars(dbPath)
            copyFileSync(plan.sourcePath, plan.targetPath)
            return true
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            console.error(`[Backup] Restore attempt from ${backupPath} failed: ${reason}`)
            continue
        }
    }

    return false
}

function getLastBackupTimestamp(): number {
    return state.lastBackupTimestamp
}

export {
    backupDatabase,
    setBackupSource,
    createBackup,
    performBackupIfNeeded,
    startAutoBackup,
    stopAutoBackup,
    restoreFromBackup,
    getLastBackupTimestamp,
    assertSafeBackupPath,
}

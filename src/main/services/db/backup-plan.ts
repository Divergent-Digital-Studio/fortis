type BackupMethod = 'vacuum-into' | 'attach-export'

interface BackupPlan {
    requiresCheckpoint: true
    method: BackupMethod
    requiresKey: true
    producesEncryptedArtifact: true
    sidecarPaths: string[]
    targetPath: string
}

interface RestorePlan {
    sourcePath: string
    targetPath: string
    requiresKey: true
    staleSidecarPaths: string[]
}

function walPath(dbPath: string): string {
    return `${dbPath}-wal`
}

function shmPath(dbPath: string): string {
    return `${dbPath}-shm`
}

function isSafeBackupPath(candidate: string): boolean {
    if (candidate.length === 0) return false
    if (candidate.includes("'")) return false
    if (candidate.includes('\n')) return false
    if (candidate.includes('\r')) return false
    if (candidate.includes('\0')) return false
    return true
}

function assertSafeBackupPath(candidate: string): string {
    if (!isSafeBackupPath(candidate)) {
        throw new Error(`Unsafe backup path rejected: ${candidate}`)
    }
    return candidate
}

function quoteSqlPath(candidate: string): string {
    return `'${assertSafeBackupPath(candidate)}'`
}

function planBackup(dbPath: string, backupPath: string): BackupPlan {
    return {
        requiresCheckpoint: true,
        method: 'vacuum-into',
        requiresKey: true,
        producesEncryptedArtifact: true,
        sidecarPaths: [walPath(dbPath), shmPath(dbPath)],
        targetPath: assertSafeBackupPath(backupPath),
    }
}

function planRestore(backupPath: string, dbPath: string): RestorePlan {
    return {
        sourcePath: backupPath,
        targetPath: dbPath,
        requiresKey: true,
        staleSidecarPaths: [walPath(dbPath), shmPath(dbPath)],
    }
}

export {
    planBackup,
    planRestore,
    walPath,
    shmPath,
    isSafeBackupPath,
    assertSafeBackupPath,
    quoteSqlPath,
}
export type { BackupPlan, RestorePlan, BackupMethod }

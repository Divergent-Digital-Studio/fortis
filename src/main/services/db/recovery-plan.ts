type RecoveryAction = 'recover-from-backup' | 'quarantine-and-recreate'

interface RecoveryDecision {
    action: RecoveryAction
    quarantinePath: string
}

interface RecoveryContext {
    dbPath: string
    backupRestored: boolean
    now: number
}

function quarantinePathFor(dbPath: string, now: number): string {
    return `${dbPath}.corrupt-${now}`
}

function decideRecovery(context: RecoveryContext): RecoveryDecision {
    if (context.backupRestored) {
        return {
            action: 'recover-from-backup',
            quarantinePath: quarantinePathFor(context.dbPath, context.now),
        }
    }

    return {
        action: 'quarantine-and-recreate',
        quarantinePath: quarantinePathFor(context.dbPath, context.now),
    }
}

export { decideRecovery, quarantinePathFor }
export type { RecoveryAction, RecoveryDecision, RecoveryContext }

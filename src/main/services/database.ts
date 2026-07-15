import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { dirname } from 'path'
import { mkdirSync, existsSync, unlinkSync, renameSync } from 'fs'
import { randomUUID } from 'crypto'
import type { NetworkConnection, ConnectionStats, TimeSeriesPoint } from '@shared/types/connection'
import type { UserSettings } from '@shared/types/settings'
import { DEFAULT_SETTINGS, SENSITIVE_SETTING_KEYS_SET } from '@shared/types/settings'
import type { Alert, AlertType, AlertSource, AlertFilters, AlertCounts } from '@shared/types/alert'
import type { ThreatLevel, AIAnalysisResult } from '@shared/types/analysis'
import type { WhitelistEntry, WhitelistSource } from '@shared/types/whitelist'
import type { WifiDevice, DnsQueryRecord, VpnLeakStatus } from '@shared/types/m1'
import type { WeeklyReport, ReportProcessStat, ReportDestinationStat } from '@shared/types/m2'
import type { AppUser, Role } from '@shared/types/m6'
import type {
    DefenseAction,
    DefenseActionKind,
    DefenseActionStatus,
    BlockedIp,
    CustomRule,
    RuleAction,
    RuleCondition,
    TlsCertInfo,
    CertStatus,
} from '@shared/types/m3'
import { encrypt, decrypt, isEncrypted, isVersionedCiphertext, reEncryptFromLegacy } from './encryption'
import { machineIdSync } from './machine-id'
import { startAutoBackup, stopAutoBackup, restoreFromBackup, backupDatabase, setBackupSource } from './backup'
import { isWhitelistedBy } from './db/whitelist-match'
import type { WhitelistMatchEntry } from './db/whitelist-match'
import { decideRecovery } from './db/recovery-plan'
import { getDbKey, dbKeyToPassphrase, assertHexPassphrase, isPlaintextSqliteFile, decideDbMigration } from './db-key'

const SENSITIVE_KEYS: ReadonlySet<string> = SENSITIVE_SETTING_KEYS_SET

const INLINE_MIGRATIONS: Array<{ version: string; sql: string }> = [
    {
        version: '001_initial_schema',
        sql: `
CREATE TABLE IF NOT EXISTS connection_diffs (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('new', 'dropped', 'changed')),
    connection_data TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS connection_snapshots (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    connections TEXT NOT NULL,
    connection_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS scan_metadata (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    platform TEXT NOT NULL,
    parser TEXT NOT NULL DEFAULT 'unknown',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    connection_count INTEGER NOT NULL DEFAULT 0,
    diff_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ai_threat', 'rule_based', 'system')),
    threat_level TEXT NOT NULL CHECK (threat_level IN ('safe', 'info', 'warning', 'danger', 'critical')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    connection_id TEXT NOT NULL DEFAULT '',
    recommendation TEXT NOT NULL DEFAULT '',
    acknowledged INTEGER NOT NULL DEFAULT 0,
    whitelisted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_connection_diffs_timestamp ON connection_diffs(timestamp);
CREATE INDEX IF NOT EXISTS idx_connection_diffs_scan_id ON connection_diffs(scan_id);
CREATE INDEX IF NOT EXISTS idx_connection_snapshots_timestamp ON connection_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_scan_metadata_timestamp ON scan_metadata(timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_threat_level ON alerts(threat_level);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
        `.trim(),
    },
    {
        version: '002_ai_engine',
        sql: `
ALTER TABLE alerts ADD COLUMN remote_address TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN remote_port INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alerts ADD COLUMN process_name TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE alerts ADD COLUMN source TEXT NOT NULL DEFAULT 'system';
ALTER TABLE alerts ADD COLUMN dedup_key TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN suppressed_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_alerts_dedup_key ON alerts(dedup_key);
CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source);

CREATE TABLE IF NOT EXISTS whitelist (
    id TEXT PRIMARY KEY,
    process_name TEXT,
    remote_address TEXT,
    remote_port INTEGER,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'system', 'learning'))
);

CREATE INDEX IF NOT EXISTS idx_whitelist_process ON whitelist(process_name);
CREATE INDEX IF NOT EXISTS idx_whitelist_address ON whitelist(remote_address);

CREATE TABLE IF NOT EXISTS ai_analysis_history (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    overall_threat_level TEXT NOT NULL CHECK (overall_threat_level IN ('safe', 'info', 'warning', 'danger', 'critical')),
    health_score REAL NOT NULL DEFAULT 100,
    summary TEXT NOT NULL DEFAULT '',
    findings_json TEXT NOT NULL DEFAULT '[]',
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_estimate REAL NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    cached INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_ai_history_timestamp ON ai_analysis_history(timestamp DESC);

CREATE TABLE IF NOT EXISTS ai_cache (
    cache_key TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);

CREATE TABLE IF NOT EXISTS baseline_connections (
    id TEXT PRIMARY KEY,
    process_name TEXT NOT NULL,
    remote_address TEXT NOT NULL DEFAULT '',
    remote_port INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    last_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(process_name, remote_address, remote_port)
);

CREATE INDEX IF NOT EXISTS idx_baseline_process ON baseline_connections(process_name);
CREATE INDEX IF NOT EXISTS idx_baseline_lookup ON baseline_connections(process_name, remote_address, remote_port);
        `.trim(),
    },
    {
        version: '003_m1_consumer',
        sql: `
CREATE TABLE IF NOT EXISTS wifi_devices (
    mac TEXT PRIMARY KEY,
    ip TEXT NOT NULL DEFAULT '',
    vendor TEXT,
    hostname TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    is_iot INTEGER NOT NULL DEFAULT 0,
    iot_category TEXT
);

CREATE INDEX IF NOT EXISTS idx_wifi_devices_last_seen ON wifi_devices(last_seen);

CREATE TABLE IF NOT EXISTS dns_queries (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    resolved_ip TEXT,
    source TEXT NOT NULL CHECK (source IN ('cache', 'ptr')),
    process_name TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(domain, resolved_ip)
);

CREATE INDEX IF NOT EXISTS idx_dns_queries_last_seen ON dns_queries(last_seen);
CREATE INDEX IF NOT EXISTS idx_dns_queries_domain ON dns_queries(domain);

CREATE TABLE IF NOT EXISTS vpn_status_history (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    tunnel_active INTEGER NOT NULL,
    default_route_through_tunnel INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
    detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_vpn_status_timestamp ON vpn_status_history(timestamp);
        `.trim(),
    },
    {
        version: '004_m2_reports',
        sql: `
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    generated_at INTEGER NOT NULL,
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    summary TEXT NOT NULL,
    health_score INTEGER,
    top_processes TEXT NOT NULL,
    top_destinations TEXT NOT NULL,
    threat_count INTEGER NOT NULL,
    new_device_count INTEGER NOT NULL,
    generated_by TEXT NOT NULL CHECK (generated_by IN ('ai', 'local'))
);

CREATE INDEX IF NOT EXISTS idx_reports_generated_at ON reports(generated_at);
        `.trim(),
    },
    {
        version: '005_m3_defense',
        sql: `
CREATE TABLE IF NOT EXISTS defense_actions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('kill', 'block')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'executed', 'failed', 'cancelled')),
    target TEXT NOT NULL,
    process_name TEXT,
    reason TEXT NOT NULL,
    rule_id TEXT,
    executed_at INTEGER,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_defense_actions_created_at ON defense_actions(created_at);

CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY,
    blocked_at INTEGER NOT NULL,
    reason TEXT NOT NULL,
    platform TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_blocked_at ON blocked_ips(blocked_at);

CREATE TABLE IF NOT EXISTS custom_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    conditions TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('alert', 'suggest-kill', 'suggest-block')),
    threat_level TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tls_certs (
    host_port TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    issuer TEXT,
    subject TEXT,
    valid_from INTEGER,
    valid_to INTEGER,
    days_until_expiry INTEGER,
    self_signed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    last_checked INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tls_certs_last_checked ON tls_certs(last_checked);
        `.trim(),
    },
    {
        version: '006_m6_enterprise',
        sql: `
CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'observer')),
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS insider_baselines (
    process_name TEXT NOT NULL,
    destination TEXT NOT NULL,
    seen_count INTEGER NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (process_name, destination)
);
        `.trim(),
    },
    {
        version: '007_wifi_device_custom_name',
        sql: `ALTER TABLE wifi_devices ADD COLUMN custom_name TEXT;`.trim(),
    },
]

interface ScanMetadataInput {
    timestamp: number
    platform: string
    parser: string
    durationMs: number
    connectionCount: number
    diffCount: number
}

interface ConnectionDiffInput {
    scanId: string
    timestamp: number
    type: 'new' | 'dropped' | 'changed'
    connectionData: NetworkConnection
}

interface ConnectionSnapshotInput {
    timestamp: number
    connections: NetworkConnection[]
}

interface AlertInput {
    timestamp: number
    type: AlertType
    threatLevel: ThreatLevel
    title: string
    description: string
    connectionId: string
    remoteAddress?: string
    remotePort?: number
    processName?: string
    recommendation: string
    confidence?: number
    source?: AlertSource
    dedupKey?: string
    suppressedCount?: number
}

interface ConnectionTimelineRow {
    timestamp: number
    connection_count: number
}

interface SettingsRow {
    key: string
    value: string
}

interface WifiDeviceRow {
    mac: string
    ip: string
    vendor: string | null
    hostname: string | null
    custom_name: string | null
    first_seen: number
    last_seen: number
    is_iot: number
    iot_category: string | null
}

interface DnsQueryRow {
    id: string
    domain: string
    resolved_ip: string | null
    source: string
    process_name: string | null
    first_seen: number
    last_seen: number
    hit_count: number
}

interface VpnStatusRow {
    id: string
    timestamp: number
    tunnel_active: number
    default_route_through_tunnel: number
    status: string
    detail: string
}

interface ReportRow {
    id: string
    generated_at: number
    period_start: number
    period_end: number
    summary: string
    health_score: number | null
    top_processes: string
    top_destinations: string
    threat_count: number
    new_device_count: number
    generated_by: string
}

interface AlertRow {
    id: string
    timestamp: number
    type: string
    threat_level: string
    title: string
    description: string
    connection_id: string
    remote_address: string
    remote_port: number
    process_name: string
    recommendation: string
    confidence: number
    acknowledged: number
    whitelisted: number
    source: string
    dedup_key: string
    suppressed_count: number
    created_at: number
}

interface WhitelistRow {
    id: string
    process_name: string | null
    remote_address: string | null
    remote_port: number | null
    reason: string
    created_at: number
    source: string
}

interface AIAnalysisRow {
    id: string
    timestamp: number
    overall_threat_level: string
    health_score: number
    summary: string
    findings_json: string
    provider: string
    model: string
    tokens_used: number
    cost_estimate: number
    latency_ms: number
    cached: number
    created_at: number
}

interface AICacheRow {
    cache_key: string
    result_json: string
    created_at: number
    expires_at: number
}

interface UserRow {
    id: string
    username: string
    role: string
    password_hash: string
    salt: string
    created_at: number
    disabled: number
}

interface UserAuthRow {
    id: string
    username: string
    role: Role
    passwordHash: string
    salt: string
    createdAt: number
    disabled: boolean
}

interface SessionRow {
    token: string
    user_id: string
    created_at: number
    expires_at: number
}

interface InsiderBaselineRow {
    process_name: string
    destination: string
    seen_count: number
    first_seen: number
    last_seen: number
}

interface BaselineRow {
    id: string
    process_name: string
    remote_address: string
    remote_port: number
    first_seen: number
    last_seen: number
    occurrence_count: number
}

interface CountRow {
    count: number
}

interface AlertIdentity {
    id: string
    processName?: string
    remoteAddress?: string
    remotePort?: number
}

interface MigrationRow {
    version: string
}

interface DefenseActionRow {
    id: string
    created_at: number
    kind: string
    status: string
    target: string
    process_name: string | null
    reason: string
    rule_id: string | null
    executed_at: number | null
    error: string | null
}

interface BlockedIpRow {
    ip: string
    blocked_at: number
    reason: string
    platform: string
    active: number
}

interface CustomRuleRow {
    id: string
    name: string
    enabled: number
    conditions: string
    action: string
    threat_level: string
    created_at: number
}

interface TlsCertRow {
    host_port: string
    host: string
    port: number
    issuer: string | null
    subject: string | null
    valid_from: number | null
    valid_to: number | null
    days_until_expiry: number | null
    self_signed: number
    status: string
    last_checked: number
}

interface IDatabaseService {
    saveDiff(input: ConnectionDiffInput): string
    saveBatchDiffs(inputs: ConnectionDiffInput[]): string[]
    saveSnapshot(input: ConnectionSnapshotInput): string
    saveScanMetadata(input: ScanMetadataInput): string
    getSetting<K extends keyof UserSettings>(key: K): UserSettings[K]
    setSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void
    setEncryptedSetting<K extends keyof UserSettings>(key: K, encryptedValue: string): void
    getAllSettings(): UserSettings
    saveAlert(input: AlertInput): string
    getAlerts(limit?: number, offset?: number): Alert[]
    getAlertsFiltered(filters: AlertFilters): Alert[]
    getRecentAlerts(limit?: number): Alert[]
    acknowledgeAlert(id: string): boolean
    whitelistAlert(id: string): boolean
    getAlertIdentities(): AlertIdentity[]
    setAlertsWhitelisted(ids: string[], whitelisted: boolean): void
    getAlertCounts(dateFilter?: { dateFrom?: number; dateTo?: number }): AlertCounts
    addWhitelistEntry(entry: Omit<WhitelistEntry, 'id' | 'createdAt'>): string
    getWhitelist(): WhitelistEntry[]
    removeWhitelistEntry(id: string): boolean
    isWhitelisted(processName?: string, remoteAddress?: string, remotePort?: number): boolean
    getCachedResult(cacheKey: string): string | null
    cacheResult(cacheKey: string, resultJson: string, ttlMs: number): void
    clearExpiredCache(): number
    saveAnalysis(result: AIAnalysisResult): string
    getAnalysisHistory(limit?: number, offset?: number): AIAnalysisResult[]
    saveBaselineEntry(processName: string, remoteAddress: string, port: number): void
    isInBaseline(processName: string, remoteAddress: string, port: number): boolean
    getBaselineCount(): number
    getTimeline(from: number, to: number): TimeSeriesPoint[]
    getConnectionStats(): ConnectionStats
    getStats(): { totalScans: number; totalDiffs: number; totalAlerts: number; oldestRecord: number | null }
    getAnalysisStats(): {
        totalCalls: number
        totalTokens: number
        totalCostUSD: number
        callsToday: number
        averageLatencyMs: number
        cacheHitRate: number
        providerBreakdown: Record<string, { calls: number; tokens: number; costUSD: number }>
    }
    compact(olderThanMs: number): number
    upsertWifiDevice(device: WifiDevice): void
    getWifiDevices(): WifiDevice[]
    renameWifiDevice(mac: string, customName: string | null): void
    upsertDnsQuery(record: DnsQueryRecord): void
    getDnsQueries(): DnsQueryRecord[]
    saveVpnStatus(status: VpnLeakStatus): void
    getLatestVpnStatus(): VpnLeakStatus | null
    pruneM1History(cutoffMs: number): void
    insertReport(report: WeeklyReport): void
    getReports(limit?: number): WeeklyReport[]
    getLatestReport(): WeeklyReport | null
    pruneReports(cutoffMs: number): void
    insertDefenseAction(a: DefenseAction): void
    updateDefenseActionStatus(id: string, status: DefenseActionStatus, executedAt: number | null, error: string | null): void
    getDefenseAction(id: string): DefenseAction | null
    getDefenseActions(limit?: number): DefenseAction[]
    pruneDefenseActions(cutoffMs: number): void
    insertBlockedIp(b: BlockedIp): void
    setBlockedIpInactive(ip: string): void
    getBlockedIps(activeOnly?: boolean): BlockedIp[]
    upsertCustomRule(rule: CustomRule): void
    deleteCustomRule(id: string): void
    getCustomRules(): CustomRule[]
    upsertTlsCert(c: TlsCertInfo): void
    getTlsCerts(): TlsCertInfo[]
    pruneTlsCerts(cutoffMs: number): void
    runMigrations(): void
    close(): void
    getLegacyMigrationSummary(): { migrated: number; remaining: number; at: number } | null
}

class DatabaseService implements IDatabaseService {
    private db: DatabaseType
    private readonly dbPath: string
    private readonly passphrase: string
    private legacyMigrationSummary: { migrated: number; remaining: number; at: number } | null = null

    constructor(dbPath: string, key?: Buffer) {
        this.dbPath = dbPath
        const keyBuffer = key ?? getDbKey(dirname(dbPath))
        this.passphrase = assertHexPassphrase(dbKeyToPassphrase(keyBuffer))
        this.db = this.initializeDatabase()
        this.migrateLegacySensitiveKeys()
        setBackupSource(this.db, this.dbPath, this.passphrase)
        startAutoBackup(this.dbPath)
    }

    private migrateLegacySensitiveKeys(): void {
        let machineId: string | null = null
        let migrated = 0
        let remaining = 0

        for (const key of SENSITIVE_KEYS) {
            const row = this.db
                .prepare('SELECT value FROM settings WHERE key = ?')
                .get(key) as SettingsRow | undefined

            if (!row || !isEncrypted(row.value)) continue

            try {
                decrypt(row.value)
                continue
            } catch {
                if (isVersionedCiphertext(row.value)) {
                    remaining++
                    console.error(`[Database] Corrupt v2 ciphertext for ${key}; not re-encrypting from legacy`)
                    continue
                }
                machineId = machineId ?? machineIdSync()
            }

            try {
                const reEncrypted = reEncryptFromLegacy(row.value, machineId)
                this.setEncryptedSetting(key as keyof UserSettings, reEncrypted)
                migrated++
            } catch (migrationError) {
                remaining++
                const reason = migrationError instanceof Error ? migrationError.message : String(migrationError)
                console.error(`[Database] Failed to migrate legacy encrypted setting ${key}: ${reason}`)
            }
        }

        if (migrated > 0 || remaining > 0) {
            this.legacyMigrationSummary = { migrated, remaining, at: Date.now() }
        }
    }

    getLegacyMigrationSummary(): { migrated: number; remaining: number; at: number } | null {
        return this.legacyMigrationSummary
    }

    private applyKey(db: DatabaseType): void {
        db.pragma("cipher='sqlcipher'")
        db.pragma(`key='${assertHexPassphrase(this.passphrase)}'`)
    }

    private openAndPrepare(path: string): DatabaseType {
        const db = new Database(path)

        this.applyKey(db)

        db.pragma('journal_mode = WAL')
        db.pragma('synchronous = NORMAL')
        db.pragma('cache_size = -64000')
        db.pragma('foreign_keys = ON')
        db.pragma('busy_timeout = 5000')

        this.ensureMigrationsTable(db)
        this.runMigrationsInternal(db)

        return db
    }

    private migratePlaintextDatabase(): void {
        const foldWal = new Database(this.dbPath)
        try {
            foldWal.pragma('journal_mode = DELETE')
            foldWal.pragma('wal_checkpoint(TRUNCATE)')
        } finally {
            foldWal.close()
        }

        for (const sidecar of [`${this.dbPath}-wal`, `${this.dbPath}-shm`]) {
            if (existsSync(sidecar)) {
                try {
                    unlinkSync(sidecar)
                } catch (sidecarError) {
                    const reason = sidecarError instanceof Error ? sidecarError.message : String(sidecarError)
                    console.error(`[Database] Failed to clear plaintext sidecar ${sidecar}: ${reason}`)
                }
            }
        }

        const plaintext = new Database(this.dbPath)
        try {
            plaintext.pragma("cipher='sqlcipher'")
            plaintext.pragma(`rekey='${assertHexPassphrase(this.passphrase)}'`)
        } finally {
            plaintext.close()
        }
    }

    private initializeDatabase(): DatabaseType {
        const dbDir = dirname(this.dbPath)
        mkdirSync(dbDir, { recursive: true })

        const decision = decideDbMigration({
            dbExists: existsSync(this.dbPath),
            isPlaintext: isPlaintextSqliteFile(this.dbPath),
        })

        if (decision.action === 'migrate-plaintext') {
            try {
                this.migratePlaintextDatabase()
            } catch (migrationError) {
                const reason = migrationError instanceof Error ? migrationError.message : String(migrationError)
                console.error(`[Database] Plaintext-to-encrypted migration failed: ${reason}`)
            }
        }

        try {
            return this.openAndPrepare(this.dbPath)
        } catch (openError) {
            const reason = openError instanceof Error ? openError.message : String(openError)
            console.error(`[Database] Primary database unusable, attempting recovery: ${reason}`)
            return this.recoverDatabase()
        }
    }

    private recoverDatabase(): DatabaseType {
        const backupRestored = restoreFromBackup(this.dbPath, this.passphrase)
        const decision = decideRecovery({ dbPath: this.dbPath, backupRestored, now: Date.now() })

        if (decision.action === 'recover-from-backup') {
            try {
                return this.openAndPrepare(this.dbPath)
            } catch (restoreError) {
                const reason = restoreError instanceof Error ? restoreError.message : String(restoreError)
                console.error(`[Database] Restored backup is also unusable, recreating fresh: ${reason}`)
            }
        }

        this.quarantineCorruptFile(decision.quarantinePath)
        return this.openAndPrepare(this.dbPath)
    }

    private quarantineCorruptFile(quarantinePath: string): void {
        if (existsSync(quarantinePath)) {
            try {
                unlinkSync(quarantinePath)
            } catch (unlinkError) {
                const reason = unlinkError instanceof Error ? unlinkError.message : String(unlinkError)
                console.error(`[Database] Failed to clear stale quarantine file ${quarantinePath}: ${reason}`)
            }
        }

        if (existsSync(this.dbPath)) {
            try {
                renameSync(this.dbPath, quarantinePath)
            } catch (renameError) {
                const reason = renameError instanceof Error ? renameError.message : String(renameError)
                console.error(`[Database] Failed to quarantine corrupt database to ${quarantinePath}: ${reason}`)
                try {
                    unlinkSync(this.dbPath)
                } catch (deleteError) {
                    const deleteReason = deleteError instanceof Error ? deleteError.message : String(deleteError)
                    console.error(`[Database] Failed to delete corrupt database ${this.dbPath}: ${deleteReason}`)
                }
            }
        }

        for (const sidecar of [`${this.dbPath}-wal`, `${this.dbPath}-shm`]) {
            if (existsSync(sidecar)) {
                try {
                    unlinkSync(sidecar)
                } catch (sidecarError) {
                    const reason = sidecarError instanceof Error ? sidecarError.message : String(sidecarError)
                    console.error(`[Database] Failed to clear stale sidecar ${sidecar}: ${reason}`)
                }
            }
        }
    }

    backup(backupPath: string): void {
        backupDatabase(this.db, this.dbPath, backupPath, this.passphrase)
    }

    private ensureMigrationsTable(db: DatabaseType): void {
        db.exec(`
            CREATE TABLE IF NOT EXISTS _migrations (
                version TEXT PRIMARY KEY,
                applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
            )
        `)
    }

    private runMigrationsInternal(db: DatabaseType): void {
        const appliedRows = db.prepare('SELECT version FROM _migrations').all() as MigrationRow[]
        const applied = new Set(appliedRows.map((r) => r.version))

        const runMigration = db.transaction((version: string, sql: string) => {
            db.exec(sql)
            db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(version)
        })

        for (const migration of INLINE_MIGRATIONS) {
            if (applied.has(migration.version)) continue
            runMigration(migration.version, migration.sql)
        }
    }

    runMigrations(): void {
        this.runMigrationsInternal(this.db)
    }

    saveDiff(input: ConnectionDiffInput): string {
        const id = randomUUID()
        const connectionDataJson = JSON.stringify(input.connectionData)

        this.db
            .prepare(
                `INSERT INTO connection_diffs (id, scan_id, timestamp, type, connection_data)
                 VALUES (@id, @scanId, @timestamp, @type, @connectionData)`,
            )
            .run({
                id,
                scanId: input.scanId,
                timestamp: input.timestamp,
                type: input.type,
                connectionData: connectionDataJson,
            })

        return id
    }

    saveBatchDiffs(inputs: ConnectionDiffInput[]): string[] {
        if (inputs.length === 0) return []

        const ids: string[] = []

        const stmt = this.db.prepare(
            `INSERT INTO connection_diffs (id, scan_id, timestamp, type, connection_data)
             VALUES (@id, @scanId, @timestamp, @type, @connectionData)`,
        )

        const insertAll = this.db.transaction((items: ConnectionDiffInput[]) => {
            for (const input of items) {
                const id = randomUUID()
                ids.push(id)

                stmt.run({
                    id,
                    scanId: input.scanId,
                    timestamp: input.timestamp,
                    type: input.type,
                    connectionData: JSON.stringify(input.connectionData),
                })
            }
        })

        insertAll(inputs)

        return ids
    }

    saveSnapshot(input: ConnectionSnapshotInput): string {
        const id = randomUUID()
        const connectionsJson = JSON.stringify(input.connections)

        this.db
            .prepare(
                `INSERT INTO connection_snapshots (id, timestamp, connections, connection_count)
                 VALUES (@id, @timestamp, @connections, @connectionCount)`,
            )
            .run({
                id,
                timestamp: input.timestamp,
                connections: connectionsJson,
                connectionCount: input.connections.length,
            })

        return id
    }

    saveScanMetadata(input: ScanMetadataInput): string {
        const id = randomUUID()

        this.db
            .prepare(
                `INSERT INTO scan_metadata (id, timestamp, platform, parser, duration_ms, connection_count, diff_count)
                 VALUES (@id, @timestamp, @platform, @parser, @durationMs, @connectionCount, @diffCount)`,
            )
            .run({
                id,
                timestamp: input.timestamp,
                platform: input.platform,
                parser: input.parser,
                durationMs: input.durationMs,
                connectionCount: input.connectionCount,
                diffCount: input.diffCount,
            })

        return id
    }

    getSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
        const row = this.db
            .prepare('SELECT value FROM settings WHERE key = ?')
            .get(key) as SettingsRow | undefined

        if (!row) {
            return DEFAULT_SETTINGS[key]
        }

        let rawValue = row.value

        if (SENSITIVE_KEYS.has(key) && isEncrypted(rawValue)) {
            try {
                rawValue = decrypt(rawValue)
            } catch {
                return DEFAULT_SETTINGS[key]
            }
        }

        try {
            return JSON.parse(rawValue) as UserSettings[K]
        } catch {
            return rawValue as UserSettings[K]
        }
    }

    setSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
        let serialized = JSON.stringify(value)

        if (SENSITIVE_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
            if (isVersionedCiphertext(value)) {
                serialized = value
            } else {
                serialized = encrypt(value)
            }
        }

        this.db
            .prepare(
                `INSERT INTO settings (key, value, updated_at)
                 VALUES (@key, @value, @updatedAt)
                 ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updatedAt`,
            )
            .run({
                key,
                value: serialized,
                updatedAt: Date.now(),
            })
    }

    setEncryptedSetting<K extends keyof UserSettings>(key: K, encryptedValue: string): void {
        this.db
            .prepare(
                `INSERT INTO settings (key, value, updated_at)
                 VALUES (@key, @value, @updatedAt)
                 ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updatedAt`,
            )
            .run({
                key,
                value: encryptedValue,
                updatedAt: Date.now(),
            })
    }

    getAllSettings(): UserSettings {
        const rows = this.db.prepare('SELECT key, value FROM settings').all() as SettingsRow[]
        const settings = { ...DEFAULT_SETTINGS }

        for (const row of rows) {
            const key = row.key as keyof UserSettings
            if (!(key in DEFAULT_SETTINGS)) continue

            const rawValue = row.value

            if (SENSITIVE_KEYS.has(key)) {
                (settings as Record<string, unknown>)[key] = ''
                continue
            }

            try {
                (settings as Record<string, unknown>)[key] = JSON.parse(rawValue)
            } catch {
                (settings as Record<string, unknown>)[key] = rawValue
            }
        }

        return settings
    }

    saveAlert(input: AlertInput): string {
        const id = randomUUID()
        const dedupKey = input.dedupKey ?? ''

        if (dedupKey) {
            const existing = this.db
                .prepare('SELECT id, suppressed_count FROM alerts WHERE dedup_key = @dedupKey AND acknowledged = 0 LIMIT 1')
                .get({ dedupKey }) as { id: string; suppressed_count: number } | undefined

            if (existing) {
                this.db
                    .prepare('UPDATE alerts SET suppressed_count = suppressed_count + 1, timestamp = @timestamp WHERE id = @id')
                    .run({ id: existing.id, timestamp: input.timestamp })
                return existing.id
            }
        }

        this.db
            .prepare(
                `INSERT INTO alerts (id, timestamp, type, threat_level, title, description, connection_id,
                    remote_address, remote_port, process_name, recommendation, confidence,
                    source, dedup_key, suppressed_count)
                 VALUES (@id, @timestamp, @type, @threatLevel, @title, @description, @connectionId,
                    @remoteAddress, @remotePort, @processName, @recommendation, @confidence,
                    @source, @dedupKey, @suppressedCount)`,
            )
            .run({
                id,
                timestamp: input.timestamp,
                type: input.type,
                threatLevel: input.threatLevel,
                title: input.title,
                description: input.description,
                connectionId: input.connectionId,
                remoteAddress: input.remoteAddress ?? '',
                remotePort: input.remotePort ?? 0,
                processName: input.processName ?? '',
                recommendation: input.recommendation,
                confidence: input.confidence ?? 0,
                source: input.source ?? 'system',
                dedupKey,
                suppressedCount: input.suppressedCount ?? 0,
            })

        return id
    }

    private mapAlertRow(row: AlertRow): Alert {
        const alert: Alert = {
            id: row.id,
            timestamp: row.timestamp,
            type: row.type as AlertType,
            threatLevel: row.threat_level as ThreatLevel,
            title: row.title,
            description: row.description,
            connectionId: row.connection_id,
            recommendation: row.recommendation,
            acknowledged: row.acknowledged === 1,
            whitelisted: row.whitelisted === 1,
            dedupKey: row.dedup_key,
            suppressedCount: row.suppressed_count,
            createdAt: row.created_at,
        }
        if (row.remote_address) alert.remoteAddress = row.remote_address
        if (row.remote_port) alert.remotePort = row.remote_port
        if (row.process_name) alert.processName = row.process_name
        if (row.confidence) alert.confidence = row.confidence
        if (row.source) alert.source = row.source as AlertSource
        return alert
    }

    getAlerts(limit = 50, offset = 0): Alert[] {
        const rows = this.db
            .prepare(
                `SELECT * FROM alerts
                 ORDER BY timestamp DESC
                 LIMIT @limit OFFSET @offset`,
            )
            .all({ limit, offset }) as AlertRow[]

        return rows.map((row) => this.mapAlertRow(row))
    }

    getAlertsFiltered(filters: AlertFilters): Alert[] {
        const conditions: string[] = []
        const params: Record<string, unknown> = {}

        if (filters.threatLevel) {
            conditions.push('threat_level = @threatLevel')
            params.threatLevel = filters.threatLevel
        }
        if (filters.type) {
            conditions.push('type = @type')
            params.type = filters.type
        }
        if (filters.acknowledged !== undefined) {
            conditions.push('acknowledged = @acknowledged')
            params.acknowledged = filters.acknowledged ? 1 : 0
        }
        if (filters.dateFrom) {
            conditions.push('timestamp >= @dateFrom')
            params.dateFrom = filters.dateFrom
        }
        if (filters.dateTo) {
            conditions.push('timestamp <= @dateTo')
            params.dateTo = filters.dateTo
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const limit = filters.limit ?? 50
        const offset = filters.offset ?? 0

        const rows = this.db
            .prepare(
                `SELECT * FROM alerts ${whereClause}
                 ORDER BY timestamp DESC
                 LIMIT @limit OFFSET @offset`,
            )
            .all({ ...params, limit, offset }) as AlertRow[]

        return rows.map((row) => this.mapAlertRow(row))
    }

    getRecentAlerts(limit = 10): Alert[] {
        const rows = this.db
            .prepare('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT @limit')
            .all({ limit }) as AlertRow[]

        return rows.map((row) => this.mapAlertRow(row))
    }

    acknowledgeAlert(id: string): boolean {
        const result = this.db
            .prepare('UPDATE alerts SET acknowledged = 1 WHERE id = @id')
            .run({ id })
        return result.changes > 0
    }

    whitelistAlert(id: string): boolean {
        const result = this.db
            .prepare('UPDATE alerts SET whitelisted = 1 WHERE id = @id')
            .run({ id })
        return result.changes > 0
    }

    getAlertIdentities(): AlertIdentity[] {
        const rows = this.db
            .prepare('SELECT id, process_name, remote_address, remote_port FROM alerts')
            .all() as Array<{
                id: string
                process_name: string | null
                remote_address: string | null
                remote_port: number | null
            }>

        return rows.map((row) => {
            const identity: AlertIdentity = { id: row.id }
            if (row.process_name) identity.processName = row.process_name
            if (row.remote_address) identity.remoteAddress = row.remote_address
            if (row.remote_port !== null) identity.remotePort = row.remote_port
            return identity
        })
    }

    setAlertsWhitelisted(ids: string[], whitelisted: boolean): void {
        if (ids.length === 0) return
        const stmt = this.db.prepare('UPDATE alerts SET whitelisted = @flag WHERE id = @id')
        const flag = whitelisted ? 1 : 0
        this.db.transaction(() => {
            for (const id of ids) stmt.run({ id, flag })
        })()
    }

    getAlertCounts(dateFilter?: { dateFrom?: number; dateTo?: number }): AlertCounts {
        const dateConditions: string[] = []
        const dateParams: Record<string, unknown> = {}

        if (dateFilter?.dateFrom) {
            dateConditions.push('timestamp >= @dateFrom')
            dateParams.dateFrom = dateFilter.dateFrom
        }
        if (dateFilter?.dateTo) {
            dateConditions.push('timestamp <= @dateTo')
            dateParams.dateTo = dateFilter.dateTo
        }

        const dateWhere = dateConditions.length > 0 ? ` WHERE ${dateConditions.join(' AND ')}` : ''
        const dateAnd = dateConditions.length > 0 ? ` AND ${dateConditions.join(' AND ')}` : ''

        const total = (this.db.prepare(`SELECT COUNT(*) as count FROM alerts${dateWhere}`).get(dateParams) as CountRow).count
        const critical = (this.db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE threat_level = 'critical'${dateAnd}`).get(dateParams) as CountRow).count
        const danger = (this.db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE threat_level = 'danger'${dateAnd}`).get(dateParams) as CountRow).count
        const warning = (this.db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE threat_level = 'warning'${dateAnd}`).get(dateParams) as CountRow).count
        const info = (this.db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE threat_level = 'info'${dateAnd}`).get(dateParams) as CountRow).count
        const unacknowledged = (this.db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0${dateAnd}`).get(dateParams) as CountRow).count

        return { total, critical, danger, warning, info, unacknowledged }
    }

    addWhitelistEntry(entry: Omit<WhitelistEntry, 'id' | 'createdAt'>): string {
        const id = randomUUID()
        this.db
            .prepare(
                `INSERT INTO whitelist (id, process_name, remote_address, remote_port, reason, source)
                 VALUES (@id, @processName, @remoteAddress, @remotePort, @reason, @source)`,
            )
            .run({
                id,
                processName: entry.processName ?? null,
                remoteAddress: entry.remoteAddress ?? null,
                remotePort: entry.remotePort ?? null,
                reason: entry.reason,
                source: entry.source,
            })
        return id
    }

    getWhitelist(): WhitelistEntry[] {
        const rows = this.db
            .prepare('SELECT * FROM whitelist ORDER BY created_at DESC')
            .all() as WhitelistRow[]

        return rows.map((row) => {
            const entry: WhitelistEntry = {
                id: row.id,
                reason: row.reason,
                createdAt: row.created_at,
                source: row.source as WhitelistSource,
            }
            if (row.process_name) entry.processName = row.process_name
            if (row.remote_address) entry.remoteAddress = row.remote_address
            if (row.remote_port !== null) entry.remotePort = row.remote_port
            return entry
        })
    }

    removeWhitelistEntry(id: string): boolean {
        const result = this.db
            .prepare('DELETE FROM whitelist WHERE id = @id')
            .run({ id })
        return result.changes > 0
    }

    isWhitelisted(processName?: string, remoteAddress?: string, remotePort?: number): boolean {
        if (processName === undefined && remoteAddress === undefined && remotePort === undefined) {
            return false
        }

        const rows = this.db
            .prepare('SELECT process_name, remote_address, remote_port FROM whitelist')
            .all() as Array<{ process_name: string | null; remote_address: string | null; remote_port: number | null }>

        const entries: WhitelistMatchEntry[] = rows.map((row) => {
            const entry: WhitelistMatchEntry = {}
            if (row.process_name !== null) entry.processName = row.process_name
            if (row.remote_address !== null) entry.remoteAddress = row.remote_address
            if (row.remote_port !== null) entry.remotePort = row.remote_port
            return entry
        })

        const query: { processName?: string; remoteAddress?: string; remotePort?: number } = {}
        if (processName !== undefined) query.processName = processName
        if (remoteAddress !== undefined) query.remoteAddress = remoteAddress
        if (remotePort !== undefined) query.remotePort = remotePort

        return isWhitelistedBy(entries, query)
    }

    getCachedResult(cacheKey: string): string | null {
        const row = this.db
            .prepare('SELECT result_json, expires_at FROM ai_cache WHERE cache_key = @cacheKey')
            .get({ cacheKey }) as AICacheRow | undefined

        if (!row) return null
        if (row.expires_at < Date.now()) {
            this.db.prepare('DELETE FROM ai_cache WHERE cache_key = @cacheKey').run({ cacheKey })
            return null
        }

        return row.result_json
    }

    cacheResult(cacheKey: string, resultJson: string, ttlMs: number): void {
        const expiresAt = Date.now() + ttlMs

        this.db
            .prepare(
                `INSERT INTO ai_cache (cache_key, result_json, expires_at)
                 VALUES (@cacheKey, @resultJson, @expiresAt)
                 ON CONFLICT(cache_key) DO UPDATE SET result_json = @resultJson, expires_at = @expiresAt, created_at = (strftime('%s', 'now') * 1000)`,
            )
            .run({ cacheKey, resultJson, expiresAt })
    }

    clearExpiredCache(): number {
        const result = this.db
            .prepare('DELETE FROM ai_cache WHERE expires_at < @now')
            .run({ now: Date.now() })
        return result.changes
    }

    saveAnalysis(result: AIAnalysisResult): string {
        const id = result.id || randomUUID()

        this.db
            .prepare(
                `INSERT INTO ai_analysis_history (id, timestamp, overall_threat_level, health_score, summary,
                    findings_json, provider, model, tokens_used, cost_estimate, latency_ms, cached)
                 VALUES (@id, @timestamp, @overallThreatLevel, @healthScore, @summary,
                    @findingsJson, @provider, @model, @tokensUsed, @costEstimate, @latencyMs, @cached)`,
            )
            .run({
                id,
                timestamp: result.timestamp,
                overallThreatLevel: result.overallThreatLevel,
                healthScore: result.healthScore,
                summary: result.summary,
                findingsJson: JSON.stringify(result.findings),
                provider: result.provider,
                model: result.model,
                tokensUsed: result.tokensUsed,
                costEstimate: result.costEstimate,
                latencyMs: result.latencyMs,
                cached: result.cached ? 1 : 0,
            })

        return id
    }

    getAnalysisHistory(limit = 20, offset = 0): AIAnalysisResult[] {
        const rows = this.db
            .prepare(
                `SELECT * FROM ai_analysis_history
                 ORDER BY timestamp DESC
                 LIMIT @limit OFFSET @offset`,
            )
            .all({ limit, offset }) as AIAnalysisRow[]

        return rows.map((row) => ({
            id: row.id,
            timestamp: row.timestamp,
            overallThreatLevel: row.overall_threat_level as ThreatLevel,
            healthScore: row.health_score,
            summary: row.summary,
            findings: JSON.parse(row.findings_json),
            newConnections: 0,
            droppedConnections: 0,
            provider: row.provider,
            model: row.model,
            tokensUsed: row.tokens_used,
            costEstimate: row.cost_estimate,
            cached: row.cached === 1,
            latencyMs: row.latency_ms,
        }))
    }

    saveBaselineEntry(processName: string, remoteAddress: string, port: number): void {
        const now = Date.now()
        const existing = this.db
            .prepare(
                'SELECT id FROM baseline_connections WHERE process_name = @processName AND remote_address = @remoteAddress AND remote_port = @port',
            )
            .get({ processName, remoteAddress, port }) as { id: string } | undefined

        if (existing) {
            this.db
                .prepare(
                    'UPDATE baseline_connections SET last_seen = @now, occurrence_count = occurrence_count + 1 WHERE id = @id',
                )
                .run({ now, id: existing.id })
        } else {
            this.db
                .prepare(
                    `INSERT INTO baseline_connections (id, process_name, remote_address, remote_port, first_seen, last_seen)
                     VALUES (@id, @processName, @remoteAddress, @port, @now, @now)`,
                )
                .run({ id: randomUUID(), processName, remoteAddress, port, now })
        }
    }

    isInBaseline(processName: string, remoteAddress: string, port: number): boolean {
        const row = this.db
            .prepare(
                'SELECT COUNT(*) as count FROM baseline_connections WHERE process_name = @processName AND remote_address = @remoteAddress AND remote_port = @port',
            )
            .get({ processName, remoteAddress, port }) as CountRow

        return row.count > 0
    }

    getBaselineCount(): number {
        const row = this.db
            .prepare('SELECT COUNT(*) as count FROM baseline_connections')
            .get() as CountRow
        return row.count
    }

    getTimeline(from: number, to: number): TimeSeriesPoint[] {
        const rows = this.db
            .prepare(
                `SELECT timestamp, connection_count
                 FROM connection_snapshots
                 WHERE timestamp >= @from AND timestamp <= @to
                 ORDER BY timestamp ASC`,
            )
            .all({ from, to }) as ConnectionTimelineRow[]

        return rows.map((row) => ({
            timestamp: row.timestamp,
            value: row.connection_count,
        }))
    }

    getConnectionStats(): ConnectionStats {
        const row = this.db
            .prepare(
                `SELECT connections, connection_count
                 FROM connection_snapshots
                 ORDER BY timestamp DESC
                 LIMIT 1`,
            )
            .get() as { connections: string; connection_count: number } | undefined

        if (!row) {
            return {
                totalActive: 0,
                totalTcp: 0,
                totalUdp: 0,
                totalEstablished: 0,
                totalListening: 0,
                uniqueRemoteAddresses: 0,
                uniqueProcesses: 0,
                topProcesses: [],
                topRemoteAddresses: [],
            }
        }

        let connections: NetworkConnection[]
        try {
            connections = JSON.parse(row.connections) as NetworkConnection[]
        } catch {
            return {
                totalActive: 0,
                totalTcp: 0,
                totalUdp: 0,
                totalEstablished: 0,
                totalListening: 0,
                uniqueRemoteAddresses: 0,
                uniqueProcesses: 0,
                topProcesses: [],
                topRemoteAddresses: [],
            }
        }

        const totalActive = connections.length
        const totalTcp = connections.filter((c) => c.protocol === 'tcp').length
        const totalUdp = connections.filter((c) => c.protocol === 'udp').length
        const totalEstablished = connections.filter((c) => c.state === 'ESTABLISHED').length
        const totalListening = connections.filter((c) => c.state === 'LISTEN').length

        const remoteAddresses = new Set(connections.map((c) => c.remoteAddress).filter(Boolean))

        const processMap = new Map<string, number>()
        for (const conn of connections) {
            const current = processMap.get(conn.processName) ?? 0
            processMap.set(conn.processName, current + 1)
        }

        const topProcesses = Array.from(processMap.entries())
            .map(([processName, connectionCount]) => ({ processName, connectionCount }))
            .sort((a, b) => b.connectionCount - a.connectionCount)
            .slice(0, 10)

        const addressMap = new Map<string, number>()
        for (const conn of connections) {
            if (conn.remoteAddress) {
                const current = addressMap.get(conn.remoteAddress) ?? 0
                addressMap.set(conn.remoteAddress, current + 1)
            }
        }

        const topRemoteAddresses = Array.from(addressMap.entries())
            .map(([address, connectionCount]) => ({ address, connectionCount }))
            .sort((a, b) => b.connectionCount - a.connectionCount)
            .slice(0, 10)

        return {
            totalActive,
            totalTcp,
            totalUdp,
            totalEstablished,
            totalListening,
            uniqueRemoteAddresses: remoteAddresses.size,
            uniqueProcesses: processMap.size,
            topProcesses,
            topRemoteAddresses,
        }
    }

    getStats(): { totalScans: number; totalDiffs: number; totalAlerts: number; oldestRecord: number | null } {
        const totalScans = (this.db.prepare('SELECT COUNT(*) as count FROM scan_metadata').get() as { count: number }).count
        const totalDiffs = (this.db.prepare('SELECT COUNT(*) as count FROM connection_diffs').get() as { count: number }).count
        const totalAlerts = (this.db.prepare('SELECT COUNT(*) as count FROM alerts').get() as { count: number }).count

        const oldestRow = this.db
            .prepare('SELECT MIN(timestamp) as oldest FROM scan_metadata')
            .get() as { oldest: number | null }

        return {
            totalScans,
            totalDiffs,
            totalAlerts,
            oldestRecord: oldestRow.oldest,
        }
    }

    getAnalysisStats(): {
        totalCalls: number
        totalTokens: number
        totalCostUSD: number
        callsToday: number
        averageLatencyMs: number
        cacheHitRate: number
        providerBreakdown: Record<string, { calls: number; tokens: number; costUSD: number }>
    } {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayMs = todayStart.getTime()

        const allTime = this.db.prepare(
            `SELECT
                COUNT(*) as totalCalls,
                COALESCE(SUM(tokens_used), 0) as totalTokens,
                COALESCE(SUM(cost_estimate), 0) as totalCostUSD,
                COALESCE(AVG(CASE WHEN cached = 0 THEN latency_ms END), 0) as avgLatency,
                COALESCE(SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END), 0) as cachedCount
             FROM ai_analysis_history`
        ).get() as { totalCalls: number; totalTokens: number; totalCostUSD: number; avgLatency: number; cachedCount: number }

        const todayRow = this.db.prepare(
            'SELECT COUNT(*) as count FROM ai_analysis_history WHERE timestamp >= @todayMs'
        ).get({ todayMs }) as CountRow

        const cacheHitRate = allTime.totalCalls > 0 ? allTime.cachedCount / allTime.totalCalls : 0

        const providerRows = this.db.prepare(
            `SELECT
                provider,
                COUNT(*) as calls,
                COALESCE(SUM(tokens_used), 0) as tokens,
                COALESCE(SUM(cost_estimate), 0) as costUSD
             FROM ai_analysis_history
             WHERE cached = 0
             GROUP BY provider`
        ).all() as Array<{ provider: string; calls: number; tokens: number; costUSD: number }>

        const providerBreakdown: Record<string, { calls: number; tokens: number; costUSD: number }> = {
            openai: { calls: 0, tokens: 0, costUSD: 0 },
            anthropic: { calls: 0, tokens: 0, costUSD: 0 },
            ollama: { calls: 0, tokens: 0, costUSD: 0 },
        }

        for (const row of providerRows) {
            if (row.provider === 'openai' || row.provider === 'anthropic' || row.provider === 'ollama') {
                providerBreakdown[row.provider] = {
                    calls: row.calls,
                    tokens: row.tokens,
                    costUSD: row.costUSD,
                }
            }
        }

        return {
            totalCalls: allTime.totalCalls,
            totalTokens: allTime.totalTokens,
            totalCostUSD: allTime.totalCostUSD,
            callsToday: todayRow.count,
            averageLatencyMs: Math.round(allTime.avgLatency),
            cacheHitRate,
            providerBreakdown,
        }
    }

    compact(olderThanMs: number): number {
        const cutoff = Date.now() - olderThanMs
        let totalDeleted = 0

        const compactAll = this.db.transaction(() => {
            const r1 = this.db.prepare('DELETE FROM connection_diffs WHERE timestamp < ?').run(cutoff)
            totalDeleted += r1.changes

            const r2 = this.db.prepare('DELETE FROM connection_snapshots WHERE timestamp < ?').run(cutoff)
            totalDeleted += r2.changes

            const r3 = this.db.prepare('DELETE FROM scan_metadata WHERE timestamp < ?').run(cutoff)
            totalDeleted += r3.changes

            const r4 = this.db.prepare('DELETE FROM alerts WHERE timestamp < ?').run(cutoff)
            totalDeleted += r4.changes

            const r5 = this.db.prepare('DELETE FROM ai_analysis_history WHERE timestamp < ?').run(cutoff)
            totalDeleted += r5.changes
        })

        compactAll()

        return totalDeleted
    }

    upsertWifiDevice(device: WifiDevice): void {
        this.db
            .prepare(
                `INSERT INTO wifi_devices (mac, ip, vendor, hostname, custom_name, first_seen, last_seen, is_iot, iot_category)
                 VALUES (@mac, @ip, @vendor, @hostname, @customName, @firstSeen, @lastSeen, @isIot, @iotCategory)
                 ON CONFLICT(mac) DO UPDATE SET
                     ip = excluded.ip,
                     vendor = excluded.vendor,
                     hostname = excluded.hostname,
                     last_seen = excluded.last_seen,
                     is_iot = excluded.is_iot,
                     iot_category = excluded.iot_category`,
            )
            .run({
                mac: device.mac,
                ip: device.ip,
                vendor: device.vendor,
                hostname: device.hostname,
                customName: device.customName ?? null,
                firstSeen: device.firstSeen,
                lastSeen: device.lastSeen,
                isIot: device.isIot ? 1 : 0,
                iotCategory: device.iotCategory,
            })
    }

    getWifiDevices(): WifiDevice[] {
        const rows = this.db
            .prepare('SELECT * FROM wifi_devices ORDER BY last_seen DESC')
            .all() as WifiDeviceRow[]

        return rows.map((row) => ({
            mac: row.mac,
            ip: row.ip,
            vendor: row.vendor,
            hostname: row.hostname,
            customName: row.custom_name,
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            isIot: row.is_iot === 1,
            iotCategory: row.iot_category,
        }))
    }

    renameWifiDevice(mac: string, customName: string | null): void {
        const trimmed = customName?.trim() ?? null
        this.db
            .prepare('UPDATE wifi_devices SET custom_name = @customName WHERE mac = @mac')
            .run({ mac, customName: trimmed === '' ? null : trimmed })
    }

    upsertDnsQuery(record: DnsQueryRecord): void {
        this.db
            .prepare(
                `INSERT INTO dns_queries (id, domain, resolved_ip, source, process_name, first_seen, last_seen, hit_count)
                 VALUES (@id, @domain, @resolvedIp, @source, @processName, @firstSeen, @lastSeen, @hitCount)
                 ON CONFLICT(domain, resolved_ip) DO UPDATE SET
                     source = excluded.source,
                     process_name = COALESCE(excluded.process_name, dns_queries.process_name),
                     last_seen = excluded.last_seen,
                     hit_count = dns_queries.hit_count + 1`,
            )
            .run({
                id: record.id,
                domain: record.domain,
                resolvedIp: record.resolvedIp,
                source: record.source,
                processName: record.processName,
                firstSeen: record.firstSeen,
                lastSeen: record.lastSeen,
                hitCount: record.hitCount,
            })
    }

    getDnsQueries(): DnsQueryRecord[] {
        const rows = this.db
            .prepare('SELECT * FROM dns_queries ORDER BY last_seen DESC')
            .all() as DnsQueryRow[]

        return rows.map((row) => ({
            id: row.id,
            domain: row.domain,
            resolvedIp: row.resolved_ip,
            source: row.source === 'ptr' ? 'ptr' : 'cache',
            processName: row.process_name,
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            hitCount: row.hit_count,
        }))
    }

    saveVpnStatus(status: VpnLeakStatus): void {
        this.db
            .prepare(
                `INSERT INTO vpn_status_history (id, timestamp, tunnel_active, default_route_through_tunnel, status, detail)
                 VALUES (@id, @timestamp, @tunnelActive, @defaultRouteThroughTunnel, @status, @detail)`,
            )
            .run({
                id: randomUUID(),
                timestamp: status.timestamp,
                tunnelActive: status.tunnelActive ? 1 : 0,
                defaultRouteThroughTunnel: status.defaultRouteThroughTunnel ? 1 : 0,
                status: status.verdict,
                detail: JSON.stringify({
                    tunnelInterface: status.tunnelInterface,
                    explanation: status.explanation,
                }),
            })
    }

    getLatestVpnStatus(): VpnLeakStatus | null {
        const row = this.db
            .prepare('SELECT * FROM vpn_status_history ORDER BY timestamp DESC LIMIT 1')
            .get() as VpnStatusRow | undefined

        if (!row) return null

        let tunnelInterface: string | null = null
        let explanation = ''
        try {
            const parsed = JSON.parse(row.detail) as { tunnelInterface?: string | null; explanation?: string }
            tunnelInterface = parsed.tunnelInterface ?? null
            explanation = parsed.explanation ?? ''
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[Database] Failed to parse vpn_status detail: ${reason}`)
        }

        return {
            verdict: row.status === 'pass' ? 'pass' : row.status === 'fail' ? 'fail' : 'warn',
            tunnelActive: row.tunnel_active === 1,
            tunnelInterface,
            defaultRouteThroughTunnel: row.default_route_through_tunnel === 1,
            explanation,
            timestamp: row.timestamp,
        }
    }

    pruneM1History(cutoffMs: number): void {
        const pruneAll = this.db.transaction(() => {
            this.db.prepare('DELETE FROM wifi_devices WHERE last_seen < ?').run(cutoffMs)
            this.db.prepare('DELETE FROM dns_queries WHERE last_seen < ?').run(cutoffMs)
            this.db.prepare('DELETE FROM vpn_status_history WHERE timestamp < ?').run(cutoffMs)
        })

        pruneAll()
    }

    insertReport(report: WeeklyReport): void {
        this.db
            .prepare(
                `INSERT INTO reports (id, generated_at, period_start, period_end, summary, health_score, top_processes, top_destinations, threat_count, new_device_count, generated_by)
                 VALUES (@id, @generatedAt, @periodStart, @periodEnd, @summary, @healthScore, @topProcesses, @topDestinations, @threatCount, @newDeviceCount, @generatedBy)`,
            )
            .run({
                id: report.id,
                generatedAt: report.generatedAt,
                periodStart: report.periodStart,
                periodEnd: report.periodEnd,
                summary: report.summary,
                healthScore: report.healthScore,
                topProcesses: JSON.stringify(report.topProcesses),
                topDestinations: JSON.stringify(report.topDestinations),
                threatCount: report.threatCount,
                newDeviceCount: report.newDeviceCount,
                generatedBy: report.generatedBy,
            })
    }

    getReports(limit = 50): WeeklyReport[] {
        const rows = this.db
            .prepare('SELECT * FROM reports ORDER BY generated_at DESC LIMIT ?')
            .all(limit) as ReportRow[]

        return rows.map((row) => this.mapReportRow(row))
    }

    getLatestReport(): WeeklyReport | null {
        const row = this.db
            .prepare('SELECT * FROM reports ORDER BY generated_at DESC LIMIT 1')
            .get() as ReportRow | undefined

        return row ? this.mapReportRow(row) : null
    }

    pruneReports(cutoffMs: number): void {
        this.db.prepare('DELETE FROM reports WHERE generated_at < ?').run(cutoffMs)
    }

    private mapReportRow(row: ReportRow): WeeklyReport {
        return {
            id: row.id,
            generatedAt: row.generated_at,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            summary: row.summary,
            healthScore: row.health_score,
            topProcesses: this.parseReportArray<ReportProcessStat>(row.top_processes),
            topDestinations: this.parseReportArray<ReportDestinationStat>(row.top_destinations),
            threatCount: row.threat_count,
            newDeviceCount: row.new_device_count,
            generatedBy: row.generated_by === 'ai' ? 'ai' : 'local',
        }
    }

    private parseReportArray<T>(raw: string): T[] {
        try {
            const parsed = JSON.parse(raw) as unknown
            return Array.isArray(parsed) ? (parsed as T[]) : []
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[Database] Failed to parse report array: ${reason}`)
            return []
        }
    }

    private mapDefenseActionRow(r: DefenseActionRow): DefenseAction {
        return {
            id: r.id,
            createdAt: r.created_at,
            kind: r.kind as DefenseActionKind,
            status: r.status as DefenseActionStatus,
            target: r.target,
            processName: r.process_name,
            reason: r.reason,
            ruleId: r.rule_id,
            executedAt: r.executed_at,
            error: r.error,
        }
    }

    insertDefenseAction(a: DefenseAction): void {
        this.db.prepare(
            `INSERT INTO defense_actions (id, created_at, kind, status, target, process_name, reason, rule_id, executed_at, error)
             VALUES (@id, @createdAt, @kind, @status, @target, @processName, @reason, @ruleId, @executedAt, @error)`,
        ).run({
            id: a.id,
            createdAt: a.createdAt,
            kind: a.kind,
            status: a.status,
            target: a.target,
            processName: a.processName,
            reason: a.reason,
            ruleId: a.ruleId,
            executedAt: a.executedAt,
            error: a.error,
        })
    }

    updateDefenseActionStatus(id: string, status: DefenseActionStatus, executedAt: number | null, error: string | null): void {
        this.db.prepare(
            'UPDATE defense_actions SET status = @status, executed_at = @executedAt, error = @error WHERE id = @id',
        ).run({ id, status, executedAt, error })
    }

    getDefenseAction(id: string): DefenseAction | null {
        const row = this.db.prepare('SELECT * FROM defense_actions WHERE id = ?').get(id) as DefenseActionRow | undefined
        return row ? this.mapDefenseActionRow(row) : null
    }

    getDefenseActions(limit = 100): DefenseAction[] {
        const rows = this.db.prepare('SELECT * FROM defense_actions ORDER BY created_at DESC LIMIT ?').all(limit) as DefenseActionRow[]
        return rows.map((r) => this.mapDefenseActionRow(r))
    }

    pruneDefenseActions(cutoffMs: number): void {
        this.db.prepare('DELETE FROM defense_actions WHERE created_at < ? AND status != ?').run(cutoffMs, 'pending')
    }

    private mapBlockedIpRow(r: BlockedIpRow): BlockedIp {
        return { ip: r.ip, blockedAt: r.blocked_at, reason: r.reason, platform: r.platform, active: r.active === 1 }
    }

    insertBlockedIp(b: BlockedIp): void {
        this.db.prepare(
            `INSERT OR REPLACE INTO blocked_ips (ip, blocked_at, reason, platform, active)
             VALUES (@ip, @blockedAt, @reason, @platform, @active)`,
        ).run({ ip: b.ip, blockedAt: b.blockedAt, reason: b.reason, platform: b.platform, active: b.active ? 1 : 0 })
    }

    setBlockedIpInactive(ip: string): void {
        this.db.prepare('UPDATE blocked_ips SET active = 0 WHERE ip = ?').run(ip)
    }

    getBlockedIps(activeOnly = false): BlockedIp[] {
        const sql = activeOnly
            ? 'SELECT * FROM blocked_ips WHERE active = 1 ORDER BY blocked_at DESC'
            : 'SELECT * FROM blocked_ips ORDER BY blocked_at DESC'
        const rows = this.db.prepare(sql).all() as BlockedIpRow[]
        return rows.map((r) => this.mapBlockedIpRow(r))
    }

    private mapCustomRuleRow(r: CustomRuleRow): CustomRule {
        let conditions: RuleCondition[] = []
        try {
            const parsed = JSON.parse(r.conditions) as unknown
            if (Array.isArray(parsed)) conditions = parsed as RuleCondition[]
        } catch {
            conditions = []
        }
        return {
            id: r.id,
            name: r.name,
            enabled: r.enabled === 1,
            conditions,
            action: r.action as RuleAction,
            threatLevel: r.threat_level as ThreatLevel,
            createdAt: r.created_at,
        }
    }

    upsertCustomRule(rule: CustomRule): void {
        this.db.prepare(
            `INSERT OR REPLACE INTO custom_rules (id, name, enabled, conditions, action, threat_level, created_at)
             VALUES (@id, @name, @enabled, @conditions, @action, @threatLevel, @createdAt)`,
        ).run({
            id: rule.id,
            name: rule.name,
            enabled: rule.enabled ? 1 : 0,
            conditions: JSON.stringify(rule.conditions),
            action: rule.action,
            threatLevel: rule.threatLevel,
            createdAt: rule.createdAt,
        })
    }

    deleteCustomRule(id: string): void {
        this.db.prepare('DELETE FROM custom_rules WHERE id = ?').run(id)
    }

    getCustomRules(): CustomRule[] {
        const rows = this.db.prepare('SELECT * FROM custom_rules ORDER BY created_at DESC').all() as CustomRuleRow[]
        return rows.map((r) => this.mapCustomRuleRow(r))
    }

    private mapTlsCertRow(r: TlsCertRow): TlsCertInfo {
        return {
            hostPort: r.host_port,
            host: r.host,
            port: r.port,
            issuer: r.issuer,
            subject: r.subject,
            validFrom: r.valid_from,
            validTo: r.valid_to,
            daysUntilExpiry: r.days_until_expiry,
            selfSigned: r.self_signed === 1,
            status: r.status as CertStatus,
            lastChecked: r.last_checked,
        }
    }

    upsertTlsCert(c: TlsCertInfo): void {
        this.db.prepare(
            `INSERT OR REPLACE INTO tls_certs (host_port, host, port, issuer, subject, valid_from, valid_to, days_until_expiry, self_signed, status, last_checked)
             VALUES (@hostPort, @host, @port, @issuer, @subject, @validFrom, @validTo, @daysUntilExpiry, @selfSigned, @status, @lastChecked)`,
        ).run({
            hostPort: c.hostPort,
            host: c.host,
            port: c.port,
            issuer: c.issuer,
            subject: c.subject,
            validFrom: c.validFrom,
            validTo: c.validTo,
            daysUntilExpiry: c.daysUntilExpiry,
            selfSigned: c.selfSigned ? 1 : 0,
            status: c.status,
            lastChecked: c.lastChecked,
        })
    }

    getTlsCerts(): TlsCertInfo[] {
        const rows = this.db.prepare('SELECT * FROM tls_certs ORDER BY last_checked DESC').all() as TlsCertRow[]
        return rows.map((r) => this.mapTlsCertRow(r))
    }

    pruneTlsCerts(cutoffMs: number): void {
        this.db.prepare('DELETE FROM tls_certs WHERE last_checked < ?').run(cutoffMs)
    }

    createUser(u: { id: string; username: string; role: Role; passwordHash: string; salt: string; createdAt: number }): void {
        this.db.prepare(
            `INSERT INTO app_users (id, username, role, password_hash, salt, created_at, disabled)
             VALUES (@id, @username, @role, @passwordHash, @salt, @createdAt, 0)`,
        ).run(u)
    }

    getUserByUsername(username: string): UserAuthRow | null {
        const row = this.db.prepare('SELECT * FROM app_users WHERE username = ?').get(username) as UserRow | undefined
        if (!row) return null
        return { id: row.id, username: row.username, role: row.role as Role, passwordHash: row.password_hash, salt: row.salt, createdAt: row.created_at, disabled: row.disabled === 1 }
    }

    getUserById(id: string): UserAuthRow | null {
        const row = this.db.prepare('SELECT * FROM app_users WHERE id = ?').get(id) as UserRow | undefined
        if (!row) return null
        return { id: row.id, username: row.username, role: row.role as Role, passwordHash: row.password_hash, salt: row.salt, createdAt: row.created_at, disabled: row.disabled === 1 }
    }

    listUsers(): AppUser[] {
        const rows = this.db.prepare('SELECT * FROM app_users ORDER BY created_at ASC').all() as UserRow[]
        return rows.map((r) => ({ id: r.id, username: r.username, role: r.role as Role, createdAt: r.created_at, disabled: r.disabled === 1 }))
    }

    countUsers(): number {
        const row = this.db.prepare('SELECT COUNT(*) AS n FROM app_users').get() as { n: number }
        return row.n
    }

    setUserDisabled(id: string, disabled: boolean): void {
        this.db.prepare('UPDATE app_users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id)
    }

    deleteUser(id: string): void {
        this.db.transaction(() => {
            this.db.prepare('DELETE FROM app_sessions WHERE user_id = ?').run(id)
            this.db.prepare('DELETE FROM app_users WHERE id = ?').run(id)
        })()
    }

    createSession(s: { token: string; userId: string; createdAt: number; expiresAt: number }): void {
        this.db.prepare(
            'INSERT OR REPLACE INTO app_sessions (token, user_id, created_at, expires_at) VALUES (@token, @userId, @createdAt, @expiresAt)',
        ).run(s)
    }

    getSession(token: string): { token: string; userId: string; expiresAt: number } | null {
        const row = this.db.prepare('SELECT * FROM app_sessions WHERE token = ?').get(token) as SessionRow | undefined
        if (!row) return null
        return { token: row.token, userId: row.user_id, expiresAt: row.expires_at }
    }

    deleteSession(token: string): void {
        this.db.prepare('DELETE FROM app_sessions WHERE token = ?').run(token)
    }

    deleteExpiredSessions(now: number): void {
        this.db.prepare('DELETE FROM app_sessions WHERE expires_at < ?').run(now)
    }

    getInsiderBaseline(processName: string, destination: string): { seenCount: number; firstSeen: number; lastSeen: number } | null {
        const row = this.db.prepare('SELECT * FROM insider_baselines WHERE process_name = ? AND destination = ?').get(processName, destination) as InsiderBaselineRow | undefined
        if (!row) return null
        return { seenCount: row.seen_count, firstSeen: row.first_seen, lastSeen: row.last_seen }
    }

    upsertInsiderBaseline(processName: string, destination: string, ts: number): void {
        this.db.prepare(
            `INSERT INTO insider_baselines (process_name, destination, seen_count, first_seen, last_seen)
             VALUES (@processName, @destination, 1, @ts, @ts)
             ON CONFLICT(process_name, destination) DO UPDATE SET seen_count = seen_count + 1, last_seen = @ts`,
        ).run({ processName, destination, ts })
    }

    listInsiderDestinations(processName: string): string[] {
        const rows = this.db.prepare('SELECT destination FROM insider_baselines WHERE process_name = ?').all(processName) as Array<{ destination: string }>
        return rows.map((r) => r.destination)
    }

    pruneInsiderBaselines(cutoffMs: number): void {
        this.db.prepare('DELETE FROM insider_baselines WHERE last_seen < ?').run(cutoffMs)
    }

    close(): void {
        stopAutoBackup()

        try {
            this.db.pragma('wal_checkpoint(TRUNCATE)')
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            console.error(`[Database] WAL checkpoint on close failed: ${reason}`)
        }

        this.db.close()
    }
}

export { DatabaseService }
export type { IDatabaseService, ScanMetadataInput, ConnectionDiffInput, ConnectionSnapshotInput, AlertInput, AlertIdentity, WhitelistRow, AIAnalysisRow, AICacheRow, BaselineRow }

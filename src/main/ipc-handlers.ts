import { ipcMain, app, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import type { MonitorStatus, AIStatusInfo, TierInfo, LearningStatusPayload, KeyValidationResult, ScanStatusPayload } from '@shared/types/ipc'
import type { FortisEventMap } from './services/event-bus'
import type { UserSettings, LicenseStatus, SubscriptionTier } from '@shared/types/settings'
import { DEFAULT_SETTINGS, BLOCKED_API_KEY_FIELDS } from '@shared/types/settings'
import { isValidBindHost } from '@shared/utils/bind-host'
import { localIpv4 } from './services/net/arp-sweep'
import type {
    NetworkConnection,
    ConnectionStats,
    TimeSeriesPoint,
} from '@shared/types/connection'
import type { Alert, AlertFilters, AlertCounts } from '@shared/types/alert'
import type { AIAnalysisResult, AIUsageStats } from '@shared/types/analysis'
import type { WhitelistEntry } from '@shared/types/whitelist'
import type { WifiDevice, DnsQueryRecord, VpnLeakStatus, GeoConnection, IotDevice } from '@shared/types/m1'
import type { WeeklyReport, ReportExportFormat, AiPayloadView, FlowGraph, OllamaModelsResult } from '@shared/types/m2'
import type { DefenseAction, BlockedIp, CustomRule, TlsCertInfo, BandwidthSnapshot } from '@shared/types/m3'
import { isValidRule } from './services/rules/rule-eval'
import { EMPTY_BANDWIDTH_SNAPSHOT } from '@shared/types/m3'
import type { UpdateStatus } from '@shared/types/m4'
import type { RemoteAgentInfo, RemoteEventItem, RemoteServerState, RemoteSnapshot, PagerDutyState } from '@shared/types/m5'
import type { AppUser, SessionInfo, Role, RestApiState, SiemState, SiemVendor, ComplianceFramework, ComplianceReport, InsiderThreatState, InsiderThreatEvent } from '@shared/types/m6'
import type { CommunityState, ThreatIntelSubmission } from '@shared/types/m7'
import { hasScope, requiredScopeFor } from './services/auth/role-scope'
import type { ThreatLevel } from '@shared/types/analysis'
import { exportReport } from './services/reports/report-export'
import { clampPeriodDays } from './services/reports/report-schedule'
import { anonymize } from './utils/anonymizer'
import { handleAutoStartSettingChange } from './services/auto-start'
import type { NetworkMonitor } from './services/network-monitor'
import type { DatabaseService } from './services/database'
import type { FortisEventBus } from './services/event-bus'
import type { WhitelistService } from './services/whitelist'
import type { AIAnalyzerService } from './services/ai-analyzer'
import type { TierGatingService } from './services/tier-gating'
import { getTierLimitsFor } from './services/tier-gating'
import { encrypt, encryptApiKey, isApiKeyFormat, sanitizeSettingsForIpc } from './services/encryption'
import { toLicenseStatus, FREE_TIER } from './services/license/license-verifier'
import { OpenAIProvider } from './services/providers/openai-provider'
import { AnthropicProvider } from './services/providers/anthropic-provider'

let monitoringState: {
    isRunning: boolean
    isPaused: boolean
    scanInterval: number
    lastScanTimestamp: number | null
    connectionCount: number
} = {
    isRunning: true,
    isPaused: false,
    scanInterval: DEFAULT_SETTINGS.scanInterval,
    lastScanTimestamp: null,
    connectionCount: 0,
}

let cachedConnections: NetworkConnection[] = []
let settingsStore: UserSettings = { ...DEFAULT_SETTINGS }

let handlersRegistered = false
let rendererBridgesUnsubscribe: (() => void) | null = null

let injectedMonitor: NetworkMonitor | null = null
let injectedDatabase: DatabaseService | null = null
let injectedEventBus: FortisEventBus | null = null
let injectedWhitelistService: WhitelistService | null = null
let injectedTierGating: TierGatingService | null = null
let injectedAnalyzer: AIAnalyzerService | null = null
let activeSessionToken: string | null = null

interface VpnStatusProvider {
    getCurrentStatus(): VpnLeakStatus
}

interface GeoConnectionsProvider {
    getCurrentGeoConnections(): GeoConnection[]
}

interface IotDevicesProvider {
    getCurrentIotDevices(): IotDevice[]
}

interface OllamaModelProvider {
    discoverModels(endpoint?: string): Promise<OllamaModelsResult>
}

interface ReportGeneratorProvider {
    generate(periodDays?: number): Promise<WeeklyReport>
}

interface FlowGraphProvider {
    getCurrent(): FlowGraph
}

interface DefenseServiceProvider {
    getActions(): DefenseAction[]
    confirmKill(actionId: string): Promise<DefenseAction[]>
    confirmBlock(actionId: string): Promise<DefenseAction[]>
    cancelAction(actionId: string): DefenseAction[]
    getBlockedIps(): BlockedIp[]
    unblock(ip: string): Promise<BlockedIp[]>
}

interface RuleEngineProvider {
    getRules(): CustomRule[]
    saveRule(rule: CustomRule): CustomRule[]
    deleteRule(id: string): CustomRule[]
}

interface CertProvider {
    getCerts(): TlsCertInfo[]
}

interface BandwidthProvider {
    getCurrent(): BandwidthSnapshot
}

interface WebhookProvider {
    test(url: string): Promise<boolean>
}

interface ReportPdfProvider {
    exportPdf(reportId: string): Promise<string>
}

interface UpdateServiceProvider {
    getStatus(): UpdateStatus
    check(): Promise<void>
    download(): Promise<void>
    install(): void
}

interface RemoteServerProvider {
    getState(): RemoteServerState
    getRecentEvents(): RemoteEventItem[]
    getAgents(): RemoteAgentInfo[]
    start(): void
    stop(): void
}

interface PagerDutyProvider {
    isConfigured(): boolean
    test(routingKey: string): Promise<boolean>
}

interface SessionServiceProvider {
    login(username: string, password: string): SessionInfo | null
    resolve(token: string): { userId: string; role: Role } | null
    resolveSession(token: string): SessionInfo | null
    logout(token: string): void
    listUsers(): AppUser[]
    createUser(username: string, password: string, role: Role): AppUser | null
    setUserDisabled(id: string, disabled: boolean): AppUser[]
    deleteUser(id: string): AppUser[]
    isRbacActive(): boolean
}

interface RestApiProvider {
    getState(): RestApiState
    start(): void
    stop(): void
    restart(): void
}

interface SiemProvider {
    isConfigured(): boolean
    test(vendor: SiemVendor, endpoint: string, token: string): Promise<boolean>
}

interface ComplianceProvider {
    generate(framework: ComplianceFramework): ComplianceReport
    exportPdf(framework: ComplianceFramework): Promise<string>
    getLast(): ComplianceReport | null
}

interface InsiderProvider {
    getRecentEvents(): InsiderThreatEvent[]
}

interface ThreatIntelProvider {
    getState(): CommunityState
    setEnabled(enabled: boolean): CommunityState
    setConfig(cfg: { endpoint: string; severityFloor: ThreatLevel }): CommunityState
    test(endpoint: string, key: string): Promise<boolean>
    previewBatch(alerts: Alert[]): ThreatIntelSubmission[]
}

let injectedVpnProvider: VpnStatusProvider | null = null
let injectedGeoProvider: GeoConnectionsProvider | null = null
let injectedIotProvider: IotDevicesProvider | null = null
let injectedOllamaProvider: OllamaModelProvider | null = null
let injectedReportGenerator: ReportGeneratorProvider | null = null
let injectedFlowProvider: FlowGraphProvider | null = null
let injectedDefenseService: DefenseServiceProvider | null = null
let injectedRuleEngine: RuleEngineProvider | null = null
let injectedCertProvider: CertProvider | null = null
let injectedBandwidthProvider: BandwidthProvider | null = null
let injectedWebhookDispatcher: WebhookProvider | null = null
let injectedReportPdf: ReportPdfProvider | null = null
let injectedUpdateService: UpdateServiceProvider | null = null
let injectedRemoteServer: RemoteServerProvider | null = null
let injectedPagerDuty: PagerDutyProvider | null = null
let injectedSessionService: SessionServiceProvider | null = null
let injectedRestApiServer: RestApiProvider | null = null
let injectedSiemDispatcher: SiemProvider | null = null
let injectedComplianceService: ComplianceProvider | null = null
let injectedInsiderService: InsiderProvider | null = null
let injectedThreatIntelDispatcher: ThreatIntelProvider | null = null

function injectServices(services: {
    monitor?: NetworkMonitor
    database?: DatabaseService
    eventBus?: FortisEventBus
    whitelistService?: WhitelistService
    tierGating?: TierGatingService
    analyzer?: AIAnalyzerService
    vpnProvider?: VpnStatusProvider
    geoProvider?: GeoConnectionsProvider
    iotProvider?: IotDevicesProvider
    ollamaProvider?: OllamaModelProvider
    reportGenerator?: ReportGeneratorProvider
    flowProvider?: FlowGraphProvider
    defenseService?: DefenseServiceProvider
    ruleEngine?: RuleEngineProvider
    certProvider?: CertProvider
    bandwidthProvider?: BandwidthProvider
    webhookDispatcher?: WebhookProvider
    reportPdf?: ReportPdfProvider
    updateService?: UpdateServiceProvider
    remoteServer?: RemoteServerProvider
    pagerDutyDispatcher?: PagerDutyProvider
    sessionService?: SessionServiceProvider
    restApiServer?: RestApiProvider
    siemDispatcher?: SiemProvider
    complianceService?: ComplianceProvider
    insiderService?: InsiderProvider
    threatIntelDispatcher?: ThreatIntelProvider
}): void {
    if (services.monitor) injectedMonitor = services.monitor
    if (services.database) injectedDatabase = services.database
    if (services.eventBus) injectedEventBus = services.eventBus
    if (services.whitelistService) injectedWhitelistService = services.whitelistService
    if (services.tierGating) injectedTierGating = services.tierGating
    if (services.analyzer) injectedAnalyzer = services.analyzer
    if (services.vpnProvider) injectedVpnProvider = services.vpnProvider
    if (services.geoProvider) injectedGeoProvider = services.geoProvider
    if (services.iotProvider) injectedIotProvider = services.iotProvider
    if (services.ollamaProvider) injectedOllamaProvider = services.ollamaProvider
    if (services.reportGenerator) injectedReportGenerator = services.reportGenerator
    if (services.flowProvider) injectedFlowProvider = services.flowProvider
    if (services.defenseService) injectedDefenseService = services.defenseService
    if (services.ruleEngine) injectedRuleEngine = services.ruleEngine
    if (services.certProvider) injectedCertProvider = services.certProvider
    if (services.bandwidthProvider) injectedBandwidthProvider = services.bandwidthProvider
    if (services.webhookDispatcher) injectedWebhookDispatcher = services.webhookDispatcher
    if (services.reportPdf) injectedReportPdf = services.reportPdf
    if (services.updateService) injectedUpdateService = services.updateService
    if (services.remoteServer) injectedRemoteServer = services.remoteServer
    if (services.pagerDutyDispatcher) injectedPagerDuty = services.pagerDutyDispatcher
    if (services.sessionService) injectedSessionService = services.sessionService
    if (services.restApiServer) injectedRestApiServer = services.restApiServer
    if (services.siemDispatcher) injectedSiemDispatcher = services.siemDispatcher
    if (services.complianceService) injectedComplianceService = services.complianceService
    if (services.insiderService) injectedInsiderService = services.insiderService
    if (services.threatIntelDispatcher) injectedThreatIntelDispatcher = services.threatIntelDispatcher

    // registerAllHandlers() runs before tierGating is injected, so the boot-time
    // call inside registerLicenseHandlers() no-ops. Re-derive here, or a cached
    // `settings.tier` outlives the license that granted it.
    if (services.tierGating) syncTierFromLicense()
}

function isValidNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function isValidString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
}

function isValidPartialSettings(value: unknown): value is Partial<UserSettings> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }

    const allowedKeys: Array<keyof UserSettings> = [
        'aiProvider',
        'openaiApiKey',
        'anthropicApiKey',
        'scanInterval',
        'adaptiveInterval',
        'notificationsEnabled',
        'soundEnabled',
        'autoStart',
        'onboardingCompleted',
        'theme',
        'sensitivityLevel',
        'tier',
        'licenseKey',
        'dailyAiScansUsed',
        'lastScanDate',
        'learningPeriodStart',
        'learningPeriodComplete',
        'binaryHash',
        'anonymizerSalt',
        'ollamaEndpoint',
        'ollamaModel',
        'windowBounds',
        'defenseEnabled',
        'webhookUrl',
        'webhookEnabled',
        'remoteServerEnabled',
        'remoteServerHost',
        'remoteServerPort',
        'remoteAuthToken',
        'remoteServerTlsEnabled',
        'remoteServerCertPath',
        'remoteServerKeyPath',
        'pagerDutyEnabled',
        'pagerDutyRoutingKey',
        'pagerDutySeverityFloor',
        'pagerDutyVerified',
        'rbacEnabled',
        'restApiEnabled',
        'restApiPort',
        'restApiToken',
        'siemEnabled',
        'siemVendor',
        'siemEndpoint',
        'siemToken',
        'siemSeverityFloor',
        'siemVerified',
        'insiderThreatEnabled',
        'complianceOrgName',
        'complianceAccentColor',
        'openaiCompatibleEndpoint',
        'language',
        'threatIntelEnabled',
        'threatIntelEndpoint',
        'threatIntelKey',
        'threatIntelVerified',
        'threatIntelSeverityFloor',
    ]

    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)

    if (keys.length === 0) return false

    for (const key of keys) {
        if (!allowedKeys.includes(key as keyof UserSettings)) {
            return false
        }
    }

    if ('scanInterval' in obj && (!isValidNumber(obj.scanInterval) || (obj.scanInterval as number) < 1000 || (obj.scanInterval as number) > 300000)) {
        return false
    }

    if ('aiProvider' in obj && (typeof obj.aiProvider !== 'string' || !['none', 'openai', 'anthropic', 'ollama', 'local'].includes(obj.aiProvider))) {
        return false
    }

    if ('theme' in obj && (typeof obj.theme !== 'string' || !['dark', 'light', 'system'].includes(obj.theme))) {
        return false
    }

    if ('sensitivityLevel' in obj && (typeof obj.sensitivityLevel !== 'string' || !['paranoid', 'balanced', 'relaxed'].includes(obj.sensitivityLevel))) {
        return false
    }

    if ('tier' in obj && (typeof obj.tier !== 'string' || !['free', 'pro', 'enterprise'].includes(obj.tier))) {
        return false
    }

    const booleanFields: Array<keyof UserSettings> = ['adaptiveInterval', 'notificationsEnabled', 'soundEnabled', 'autoStart', 'onboardingCompleted', 'learningPeriodComplete', 'defenseEnabled', 'webhookEnabled', 'remoteServerEnabled', 'pagerDutyEnabled', 'pagerDutyVerified', 'rbacEnabled', 'restApiEnabled', 'siemEnabled', 'siemVerified', 'insiderThreatEnabled', 'threatIntelEnabled', 'threatIntelVerified']
    for (const field of booleanFields) {
        if (field in obj && typeof obj[field] !== 'boolean') {
            return false
        }
    }

    if ('webhookUrl' in obj && typeof obj.webhookUrl !== 'string') {
        return false
    }

    if ('remoteServerHost' in obj && !isValidBindHost(obj.remoteServerHost)) {
        return false
    }

    if ('remoteAuthToken' in obj && typeof obj.remoteAuthToken !== 'string') {
        return false
    }

    if ('remoteServerTlsEnabled' in obj && typeof obj.remoteServerTlsEnabled !== 'boolean') {
        return false
    }

    if ('remoteServerCertPath' in obj && typeof obj.remoteServerCertPath !== 'string') {
        return false
    }

    if ('remoteServerKeyPath' in obj && typeof obj.remoteServerKeyPath !== 'string') {
        return false
    }

    if ('pagerDutyRoutingKey' in obj && typeof obj.pagerDutyRoutingKey !== 'string') {
        return false
    }

    if ('remoteServerPort' in obj && (!isValidNumber(obj.remoteServerPort) || (obj.remoteServerPort as number) < 1024 || (obj.remoteServerPort as number) > 65535)) {
        return false
    }

    if ('pagerDutySeverityFloor' in obj && (typeof obj.pagerDutySeverityFloor !== 'string' || !['safe', 'info', 'warning', 'danger', 'critical'].includes(obj.pagerDutySeverityFloor))) {
        return false
    }

    if ('restApiPort' in obj && (!isValidNumber(obj.restApiPort) || (obj.restApiPort as number) < 1024 || (obj.restApiPort as number) > 65535)) {
        return false
    }

    if ('restApiToken' in obj && typeof obj.restApiToken !== 'string') {
        return false
    }

    if ('siemVendor' in obj && (typeof obj.siemVendor !== 'string' || !['splunk', 'elastic', 'datadog'].includes(obj.siemVendor))) {
        return false
    }

    if ('siemEndpoint' in obj && typeof obj.siemEndpoint !== 'string') {
        return false
    }

    if ('siemToken' in obj && typeof obj.siemToken !== 'string') {
        return false
    }

    if ('siemSeverityFloor' in obj && (typeof obj.siemSeverityFloor !== 'string' || !['safe', 'info', 'warning', 'danger', 'critical'].includes(obj.siemSeverityFloor))) {
        return false
    }

    if ('complianceOrgName' in obj && typeof obj.complianceOrgName !== 'string') {
        return false
    }

    if ('complianceAccentColor' in obj && typeof obj.complianceAccentColor !== 'string') {
        return false
    }

    if ('openaiCompatibleEndpoint' in obj && typeof obj.openaiCompatibleEndpoint !== 'string') {
        return false
    }

    if ('language' in obj && (typeof obj.language !== 'string' || !['en', 'es', 'fr', 'de', 'fa', 'ar'].includes(obj.language))) {
        return false
    }

    if ('threatIntelEndpoint' in obj && typeof obj.threatIntelEndpoint !== 'string') {
        return false
    }

    if ('threatIntelKey' in obj && typeof obj.threatIntelKey !== 'string') {
        return false
    }

    if ('threatIntelSeverityFloor' in obj && (typeof obj.threatIntelSeverityFloor !== 'string' || !['safe', 'info', 'warning', 'danger', 'critical'].includes(obj.threatIntelSeverityFloor))) {
        return false
    }

    if ('dailyAiScansUsed' in obj && !isValidNumber(obj.dailyAiScansUsed)) {
        return false
    }

    if ('lastScanDate' in obj && typeof obj.lastScanDate !== 'string') {
        return false
    }

    if ('learningPeriodStart' in obj && typeof obj.learningPeriodStart !== 'string') {
        return false
    }

    if ('binaryHash' in obj && typeof obj.binaryHash !== 'string') {
        return false
    }

    if ('anonymizerSalt' in obj && typeof obj.anonymizerSalt !== 'string') {
        return false
    }

    if ('ollamaEndpoint' in obj && typeof obj.ollamaEndpoint !== 'string') {
        return false
    }

    if ('ollamaModel' in obj && typeof obj.ollamaModel !== 'string') {
        return false
    }

    if ('licenseKey' in obj && obj.licenseKey !== null && typeof obj.licenseKey !== 'string') {
        return false
    }

    return true
}

function isValidAlertFilters(value: unknown): value is AlertFilters {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }

    const obj = value as Record<string, unknown>
    const allowedKeys = ['threatLevel', 'type', 'acknowledged', 'dateFrom', 'dateTo', 'limit', 'offset']

    for (const key of Object.keys(obj)) {
        if (!allowedKeys.includes(key)) return false
    }

    if ('threatLevel' in obj && typeof obj.threatLevel !== 'string') return false
    if ('type' in obj && typeof obj.type !== 'string') return false
    if ('acknowledged' in obj && typeof obj.acknowledged !== 'boolean') return false
    if ('dateFrom' in obj && !isValidNumber(obj.dateFrom)) return false
    if ('dateTo' in obj && !isValidNumber(obj.dateTo)) return false
    if ('limit' in obj && (!isValidNumber(obj.limit) || (obj.limit as number) < 1 || (obj.limit as number) > 500)) return false
    if ('offset' in obj && (!isValidNumber(obj.offset) || (obj.offset as number) < 0)) return false

    return true
}

function isValidWhitelistInput(value: unknown): value is Omit<WhitelistEntry, 'id' | 'createdAt'> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }

    const obj = value as Record<string, unknown>

    if (typeof obj.reason !== 'string') return false
    if (typeof obj.source !== 'string' || !['user', 'system', 'learning'].includes(obj.source)) return false
    if ('processName' in obj && obj.processName !== undefined && typeof obj.processName !== 'string') return false
    if ('remoteAddress' in obj && obj.remoteAddress !== undefined && typeof obj.remoteAddress !== 'string') return false
    if ('remotePort' in obj && obj.remotePort !== undefined && !isValidNumber(obj.remotePort)) return false

    return true
}

function createIpcError(code: string, message: string): { success: false; error: { code: string; message: string } } {
    return { success: false, error: { code, message } }
}

function getMainWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows()
    return windows.length > 0 ? (windows[0] ?? null) : null
}

const LEARNING_PERIOD_DAYS = 7

function registerConnectionHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.CONNECTIONS_GET, async (_e): Promise<NetworkConnection[]> => {
        enforceScope('connections:get', null)
        return cachedConnections
    })
}

function registerScanControlHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.SCAN_TRIGGER, async (): Promise<void> => {
        enforceScope('scan:trigger', null)
        try {
            if (injectedMonitor) {
                pushScanStatusUpdate({ scanning: true })
                await injectedMonitor.triggerManualScan()
            }
            monitoringState.lastScanTimestamp = Date.now()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to trigger scan'
            pushScanStatusUpdate({ scanning: false, error: message })
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.MONITOR_PAUSE, async (): Promise<void> => {
        enforceScope('monitor:pause', null)
        try {
            if (injectedMonitor) {
                injectedMonitor.pause()
            }
            monitoringState.isPaused = true
            monitoringState.isRunning = false
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to pause monitoring'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.MONITOR_RESUME, async (): Promise<void> => {
        enforceScope('monitor:resume', null)
        try {
            if (injectedMonitor) {
                injectedMonitor.resume()
            }
            monitoringState.isPaused = false
            monitoringState.isRunning = true
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to resume monitoring'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.MONITOR_STATUS, async (): Promise<MonitorStatus> => {
        enforceScope('monitor:status', null)
        try {
            if (injectedMonitor) {
                const status = injectedMonitor.getStatus()
                monitoringState.isRunning = status === 'running'
                monitoringState.isPaused = status === 'paused'
                monitoringState.lastScanTimestamp = injectedMonitor.getLastScanTimestamp()
                monitoringState.connectionCount = cachedConnections.length
            }

            return {
                isRunning: monitoringState.isRunning,
                isPaused: monitoringState.isPaused,
                scanInterval: monitoringState.scanInterval,
                lastScanTimestamp: monitoringState.lastScanTimestamp,
                connectionCount: monitoringState.connectionCount,
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get monitor status'
            throw new Error(message)
        }
    })
}

function registerSettingsHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<UserSettings> => {
        enforceScope('settings:get', null)
        try {
            if (injectedDatabase) {
                settingsStore = injectedDatabase.getAllSettings()
            }
            const sanitized = sanitizeSettingsForIpc({ ...settingsStore }) as unknown as UserSettings
            return sanitized
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get settings'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_event, partialSettings: unknown, sessionToken?: unknown) => {
        try {
            if (!isValidPartialSettings(partialSettings)) {
                return createIpcError('VALIDATION_ERROR', 'Invalid settings data')
            }

            const rbacGuard = enforceSettingsScope(partialSettings, sessionToken)
            if (rbacGuard) return rbacGuard

            const safeSettings = { ...partialSettings } as Record<string, unknown>
            delete safeSettings['tier']
            for (const field of BLOCKED_API_KEY_FIELDS) {
                delete safeSettings[field]
            }

            if (Object.keys(safeSettings).length === 0) {
                return createIpcError('VALIDATION_ERROR', 'Tier and API keys must be set via their dedicated channels')
            }

            const entries = Object.entries(safeSettings) as Array<[keyof UserSettings, unknown]>
            for (const [key, value] of entries) {
                if (injectedDatabase) {
                    injectedDatabase.setSetting(key, value as UserSettings[typeof key])
                }

                if (injectedEventBus) {
                    injectedEventBus.emit('settings:changed', { key, value })
                }
            }

            settingsStore = { ...settingsStore, ...safeSettings }

            if ('scanInterval' in safeSettings && isValidNumber(safeSettings.scanInterval)) {
                monitoringState.scanInterval = safeSettings.scanInterval as number
            }

            if ('autoStart' in safeSettings && typeof safeSettings.autoStart === 'boolean') {
                handleAutoStartSettingChange(safeSettings.autoStart)
            }

            pushSettingsChanged(settingsStore)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update settings'
            return createIpcError('SETTINGS_UPDATE_FAILED', message)
        }
    })
}

function registerStatsAndAppHandlers(): void {
    ipcMain.handle(
        IPC_CHANNELS.STATS_CONNECTION_TIMELINE,
        async (_event, from: unknown, to: unknown): Promise<TimeSeriesPoint[]> => {
            enforceScope('stats:connection-timeline', null)
            try {
                if (!isValidNumber(from) || !isValidNumber(to)) {
                    throw new Error('Invalid time range parameters')
                }

                if (from > to) {
                    throw new Error('Start time must be before end time')
                }

                const MAX_RANGE_MS = 24 * 60 * 60 * 1000
                if (to - from > MAX_RANGE_MS) {
                    throw new Error('Time range exceeds maximum of 24 hours')
                }

                if (from < 0 || to < 0) {
                    throw new Error('Time values must be positive')
                }

                if (injectedDatabase) {
                    return injectedDatabase.getTimeline(from, to)
                }

                return []
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to get timeline'
                throw new Error(message)
            }
        },
    )

    ipcMain.handle(IPC_CHANNELS.STATS_CONNECTION_STATS, async (): Promise<ConnectionStats> => {
        enforceScope('stats:connection-stats', null)
        try {
            const connections = cachedConnections
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
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get connection stats'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
        return app.getVersion()
    })

    ipcMain.handle(IPC_CHANNELS.APP_PLATFORM, async (): Promise<NodeJS.Platform> => {
        return process.platform
    })
}

const MAX_ALERT_LIMIT = 500
const DEFAULT_ALERT_LIMIT = 50

function clampAlertLimit(value: unknown): number {
    if (!isValidNumber(value) || value < 1) return DEFAULT_ALERT_LIMIT
    return Math.min(Math.floor(value), MAX_ALERT_LIMIT)
}

function registerAlertHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.ALERTS_GET, async (_event, filtersOrLimit: unknown): Promise<Alert[]> => {
        enforceScope('alerts:get', null)
        try {
            if (!injectedDatabase) return []

            const tierHistoryFilter = injectedTierGating?.getAlertHistoryFilter() ?? null

            if (isValidNumber(filtersOrLimit)) {
                const limit = clampAlertLimit(filtersOrLimit)
                if (tierHistoryFilter) {
                    return injectedDatabase.getAlertsFiltered({
                        limit,
                        dateFrom: tierHistoryFilter.dateFrom,
                    })
                }
                return injectedDatabase.getAlerts(limit)
            }

            if (filtersOrLimit && typeof filtersOrLimit === 'object' && isValidAlertFilters(filtersOrLimit)) {
                const filters = tierHistoryFilter
                    ? { ...filtersOrLimit, dateFrom: filtersOrLimit.dateFrom ?? tierHistoryFilter.dateFrom }
                    : filtersOrLimit
                return injectedDatabase.getAlertsFiltered(filters)
            }

            if (tierHistoryFilter) {
                return injectedDatabase.getAlertsFiltered({
                    limit: DEFAULT_ALERT_LIMIT,
                    dateFrom: tierHistoryFilter.dateFrom,
                })
            }

            return injectedDatabase.getAlerts(DEFAULT_ALERT_LIMIT)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get alerts'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.ALERTS_RECENT, async (_event, limit: unknown): Promise<Alert[]> => {
        enforceScope('alerts:recent', null)
        try {
            if (!injectedDatabase) return []

            const safeLimit = clampAlertLimit(limit)
            const tierHistoryFilter = injectedTierGating?.getAlertHistoryFilter() ?? null

            if (tierHistoryFilter) {
                return injectedDatabase.getAlertsFiltered({
                    limit: safeLimit,
                    dateFrom: tierHistoryFilter.dateFrom,
                })
            }

            return injectedDatabase.getRecentAlerts(safeLimit)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get recent alerts'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.ALERTS_ACKNOWLEDGE, async (_event, id: unknown): Promise<boolean> => {
        enforceScope('alerts:acknowledge', null)
        try {
            if (!injectedDatabase) return false
            if (!isValidString(id)) {
                throw new Error('Invalid alert ID')
            }

            return injectedDatabase.acknowledgeAlert(id)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to acknowledge alert'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.ALERTS_COUNTS, async (): Promise<AlertCounts> => {
        enforceScope('alerts:counts', null)
        try {
            if (!injectedDatabase) {
                return { total: 0, critical: 0, danger: 0, warning: 0, info: 0, unacknowledged: 0 }
            }

            const tierHistoryFilter = injectedTierGating?.getAlertHistoryFilter() ?? null
            return injectedDatabase.getAlertCounts(tierHistoryFilter ?? undefined)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get alert counts'
            throw new Error(message)
        }
    })
}

function registerWhitelistHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.WHITELIST_GET, async (): Promise<WhitelistEntry[]> => {
        enforceScope('whitelist:get', null)
        try {
            if (injectedWhitelistService) return injectedWhitelistService.getAll()
            if (!injectedDatabase) return []
            return injectedDatabase.getWhitelist()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get whitelist'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.WHITELIST_ADD, async (_event, entry: unknown): Promise<string> => {
        enforceScope('whitelist:add', null)
        try {
            if (!isValidWhitelistInput(entry)) {
                throw new Error('Invalid whitelist entry data')
            }

            if (injectedWhitelistService) {
                const id = injectedWhitelistService.add(entry)
                pushWhitelistUpdate()
                return id
            }

            if (!injectedDatabase) {
                throw new Error('Database not available')
            }

            const id = injectedDatabase.addWhitelistEntry(entry)
            return id
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to add whitelist entry'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.WHITELIST_REMOVE, async (_event, id: unknown): Promise<boolean> => {
        enforceScope('whitelist:remove', null)
        try {
            if (!isValidString(id)) {
                throw new Error('Invalid whitelist entry ID')
            }

            if (injectedWhitelistService) {
                const removed = injectedWhitelistService.remove(id)
                if (removed) pushWhitelistUpdate()
                return removed
            }

            if (!injectedDatabase) return false
            return injectedDatabase.removeWhitelistEntry(id)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to remove whitelist entry'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.WHITELIST_EXPORT, async (): Promise<WhitelistEntry[]> => {
        enforceScope('whitelist:export', null)
        try {
            if (injectedWhitelistService) return injectedWhitelistService.exportWhitelist()
            if (injectedDatabase) return injectedDatabase.getWhitelist()
            return []
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to export whitelist'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.WHITELIST_IMPORT, async (_event, entries: unknown): Promise<{ imported: number; skipped: number }> => {
        enforceScope('whitelist:import', null)
        try {
            if (!injectedWhitelistService) {
                throw new Error('Whitelist service not available')
            }

            if (!Array.isArray(entries)) {
                throw new Error('Import data must be an array')
            }

            const result = injectedWhitelistService.importWhitelist(entries)
            if (result.imported > 0) pushWhitelistUpdate()
            return result
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to import whitelist'
            throw new Error(message)
        }
    })
}

function registerAIHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.AI_ANALYZE, async (): Promise<AIAnalysisResult | null> => {
        enforceScope('ai:analyze', null)
        try {
            if (!injectedAnalyzer) return null

            const connections = cachedConnections
            if (connections.length === 0) return null

            return await injectedAnalyzer.analyzeFull(connections)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to trigger AI analysis'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.AI_STATUS, async (): Promise<AIStatusInfo> => {
        enforceScope('ai:status', null)
        try {
            const provider = settingsStore.aiProvider === 'none' ? null : settingsStore.aiProvider

            const lastAnalysisTimestamp = injectedDatabase
                ? injectedDatabase.getAnalysisHistory(1)[0]?.timestamp ?? null
                : null

            if (injectedAnalyzer) {
                const available = await injectedAnalyzer.isAvailable()
                const degraded = injectedAnalyzer.isInDegradedMode()
                return {
                    provider: injectedAnalyzer.getActiveProvider() ?? provider,
                    isAvailable: available,
                    circuitState: degraded ? 'open' : 'closed',
                    lastAnalysisTimestamp,
                }
            }

            return {
                provider,
                isAvailable: provider !== null,
                circuitState: 'closed',
                lastAnalysisTimestamp,
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get AI status'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.AI_LAST_ANALYSIS, async (): Promise<AIAnalysisResult | null> => {
        enforceScope('ai:status', null)
        try {
            if (!injectedDatabase) return null
            return injectedDatabase.getAnalysisHistory(1)[0] ?? null
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get last analysis'
            throw new Error(message)
        }
    })

    ipcMain.handle(IPC_CHANNELS.AI_USAGE, async (): Promise<AIUsageStats> => {
        enforceScope('ai:usage', null)
        try {
            if (injectedAnalyzer) {
                return injectedAnalyzer.getUsageStats()
            }

            if (injectedDatabase) {
                const dbStats = injectedDatabase.getAnalysisStats()
                return {
                    totalCalls: dbStats.totalCalls,
                    totalTokens: dbStats.totalTokens,
                    totalCostUSD: dbStats.totalCostUSD,
                    callsToday: dbStats.callsToday,
                    averageLatencyMs: dbStats.averageLatencyMs,
                    cacheHitRate: dbStats.cacheHitRate,
                    providerBreakdown: {
                        openai: dbStats.providerBreakdown['openai'] ?? { calls: 0, tokens: 0, costUSD: 0 },
                        anthropic: dbStats.providerBreakdown['anthropic'] ?? { calls: 0, tokens: 0, costUSD: 0 },
                        ollama: dbStats.providerBreakdown['ollama'] ?? { calls: 0, tokens: 0, costUSD: 0 },
                    },
                }
            }

            return {
                totalCalls: 0,
                totalTokens: 0,
                totalCostUSD: 0,
                callsToday: 0,
                averageLatencyMs: 0,
                cacheHitRate: 0,
                providerBreakdown: {
                    openai: { calls: 0, tokens: 0, costUSD: 0 },
                    anthropic: { calls: 0, tokens: 0, costUSD: 0 },
                    ollama: { calls: 0, tokens: 0, costUSD: 0 },
                },
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get AI usage'
            throw new Error(message)
        }
    })
}

function registerTierInfoHandler(): void {
    ipcMain.handle(IPC_CHANNELS.TIER_INFO, async (): Promise<TierInfo> => {
        enforceScope('tier:info', null)
        try {
            const tier = settingsStore.tier || 'free'

            let remainingScans: number
            let totalAllowedScans: number
            let isAutoTriggersEnabled: boolean
            let isNotificationsEnabled: boolean

            if (injectedTierGating) {
                remainingScans = injectedTierGating.getRemainingScans()
                totalAllowedScans = injectedTierGating.getTotalAllowedScans()
                isAutoTriggersEnabled = injectedTierGating.canTriggerAutomatically()
                isNotificationsEnabled = injectedTierGating.isNotificationsAllowed()
            } else {
                const limits = getTierLimitsFor(tier)
                const totalAllowed = limits.dailyScans
                const dailyUsed = settingsStore.dailyAiScansUsed || 0
                remainingScans = Number.isFinite(totalAllowed) ? Math.max(0, totalAllowed - dailyUsed) : Infinity
                totalAllowedScans = totalAllowed
                isAutoTriggersEnabled = limits.autoTriggersEnabled
                isNotificationsEnabled = limits.notificationsEnabled
            }

            let isLearningPeriod = false
            let learningDaysRemaining = 0

            if (settingsStore.learningPeriodStart && !settingsStore.learningPeriodComplete) {
                const startDate = new Date(settingsStore.learningPeriodStart).getTime()
                const elapsed = Date.now() - startDate
                const elapsedDays = elapsed / (1000 * 60 * 60 * 24)

                if (elapsedDays < LEARNING_PERIOD_DAYS) {
                    isLearningPeriod = true
                    learningDaysRemaining = Math.ceil(LEARNING_PERIOD_DAYS - elapsedDays)
                }
            }

            return {
                tier,
                remainingScans,
                totalAllowedScans,
                isLearningPeriod,
                learningDaysRemaining,
                isAutoTriggersEnabled,
                isNotificationsEnabled,
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get tier info'
            throw new Error(message)
        }
    })
}

function pushConnectionsUpdate(connections: NetworkConnection[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
        mainWindow.webContents.send(IPC_CHANNELS.CONNECTIONS_UPDATE, connections)
    } catch {
        // noop — window may have been closed between check and send
    }
}

function pushSettingsChanged(settings: UserSettings): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
        const sanitized = sanitizeSettingsForIpc({ ...settings })
        mainWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, sanitized)
    } catch {
        // noop
    }
}

function pushScanStatusUpdate(status: ScanStatusPayload): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
        mainWindow.webContents.send(IPC_CHANNELS.SCAN_STATUS_UPDATE, status)
    } catch {
        // noop
    }
}

function handleScanError(error: { message: string }): void {
    pushScanStatusUpdate({ scanning: false, error: error.message })
}

function pushNewAlert(alert: Alert): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
        mainWindow.webContents.send(IPC_CHANNELS.ALERT_NEW, alert)
    } catch {
        // noop
    }
}

function pushAnalysisUpdate(result: AIAnalysisResult): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
        mainWindow.webContents.send(IPC_CHANNELS.AI_ANALYSIS_UPDATE, result)
    } catch {
        // noop
    }
}

function pushWhitelistUpdate(): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
        const entries = injectedWhitelistService
            ? injectedWhitelistService.getAll()
            : injectedDatabase
                ? injectedDatabase.getWhitelist()
                : []
        mainWindow.webContents.send(IPC_CHANNELS.WHITELIST_UPDATED, entries)
    } catch {
        // noop
    }
}

function pushLearningStatus(status: LearningStatusPayload): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
        mainWindow.webContents.send(IPC_CHANNELS.LEARNING_STATUS, status)
    } catch {
        // noop
    }
}

interface RendererBridgeBus {
    on<K extends keyof FortisEventMap>(
        event: K,
        listener: FortisEventMap[K] extends void
            ? () => void
            : (payload: FortisEventMap[K]) => void,
    ): unknown
    off<K extends keyof FortisEventMap>(
        event: K,
        listener: FortisEventMap[K] extends void
            ? () => void
            : (payload: FortisEventMap[K]) => void,
    ): unknown
}

function wireRendererBridges(bus: RendererBridgeBus): () => void {
    if (rendererBridgesUnsubscribe) {
        return rendererBridgesUnsubscribe
    }

    const onComplete = (payload: FortisEventMap['analysis:complete']): void => {
        pushAnalysisUpdate(payload.result)
    }
    const onCached = (payload: FortisEventMap['analysis:cached']): void => {
        pushAnalysisUpdate(payload.result)
    }

    const onDevices = (payload: FortisEventMap['devices:discovered']): void => {
        pushDevicesUpdate(payload.devices)
    }
    const onDns = (payload: FortisEventMap['dns:collected']): void => {
        pushDnsUpdate(payload.records)
    }
    const onVpn = (payload: FortisEventMap['vpn:evaluated']): void => {
        pushVpnUpdate(payload.status)
    }
    const onGeo = (payload: FortisEventMap['geo:updated']): void => {
        pushGeoUpdate(payload.connections)
    }
    const onIot = (payload: FortisEventMap['iot:updated']): void => {
        pushIotUpdate(payload.devices)
    }
    const onReport = (payload: FortisEventMap['report:generated']): void => {
        pushReportsUpdate(payload.reports)
    }
    const onFlow = (payload: FortisEventMap['flow:updated']): void => {
        pushFlowUpdate(payload.graph)
    }
    const onDefense = (payload: FortisEventMap['defense:updated']): void => {
        pushDefenseActionsUpdate(payload.actions)
    }
    const onCerts = (payload: FortisEventMap['certs:updated']): void => {
        pushCertsUpdate(payload.certs)
    }
    const onBandwidth = (payload: FortisEventMap['bandwidth:updated']): void => {
        pushBandwidthUpdate(payload.snapshot)
    }
    const onUpdate = (payload: FortisEventMap['update:status']): void => {
        pushUpdateStatus(payload)
    }
    const onRemoteAgents = (payload: FortisEventMap['remote:agents']): void => {
        pushRemoteAgents(payload.agents)
    }
    const onRemoteEvent = (payload: FortisEventMap['remote:event']): void => {
        pushRemoteEvent(payload.item)
    }
    const onRemoteServerState = (payload: FortisEventMap['remote:server-state']): void => {
        pushRemoteServerState(payload)
    }
    const onUsersChanged = (payload: FortisEventMap['users:changed']): void => {
        pushUsersChanged(payload.users)
    }
    const onRestState = (payload: FortisEventMap['rest:state']): void => {
        pushRestState(payload)
    }
    const onSiemState = (payload: FortisEventMap['siem:state']): void => {
        pushSiemState(payload)
    }
    const onInsiderEvent = (payload: FortisEventMap['insider:event']): void => {
        pushInsiderEvent(payload.event)
    }
    const onComplianceReady = (payload: FortisEventMap['compliance:ready']): void => {
        pushComplianceReady(payload.report)
    }
    const onCommunityState = (payload: FortisEventMap['community:state']): void => {
        pushCommunityState(payload)
    }

    bus.on('analysis:complete', onComplete)
    bus.on('analysis:cached', onCached)
    bus.on('devices:discovered', onDevices)
    bus.on('dns:collected', onDns)
    bus.on('vpn:evaluated', onVpn)
    bus.on('geo:updated', onGeo)
    bus.on('iot:updated', onIot)
    bus.on('report:generated', onReport)
    bus.on('flow:updated', onFlow)
    bus.on('defense:updated', onDefense)
    bus.on('certs:updated', onCerts)
    bus.on('bandwidth:updated', onBandwidth)
    bus.on('update:status', onUpdate)
    bus.on('remote:agents', onRemoteAgents)
    bus.on('remote:event', onRemoteEvent)
    bus.on('remote:server-state', onRemoteServerState)
    bus.on('users:changed', onUsersChanged)
    bus.on('rest:state', onRestState)
    bus.on('siem:state', onSiemState)
    bus.on('insider:event', onInsiderEvent)
    bus.on('compliance:ready', onComplianceReady)
    bus.on('community:state', onCommunityState)

    rendererBridgesUnsubscribe = (): void => {
        bus.off('analysis:complete', onComplete)
        bus.off('analysis:cached', onCached)
        bus.off('devices:discovered', onDevices)
        bus.off('dns:collected', onDns)
        bus.off('vpn:evaluated', onVpn)
        bus.off('geo:updated', onGeo)
        bus.off('iot:updated', onIot)
        bus.off('report:generated', onReport)
        bus.off('flow:updated', onFlow)
        bus.off('defense:updated', onDefense)
        bus.off('certs:updated', onCerts)
        bus.off('bandwidth:updated', onBandwidth)
        bus.off('update:status', onUpdate)
        bus.off('remote:agents', onRemoteAgents)
        bus.off('remote:event', onRemoteEvent)
        bus.off('remote:server-state', onRemoteServerState)
        bus.off('users:changed', onUsersChanged)
        bus.off('rest:state', onRestState)
        bus.off('siem:state', onSiemState)
        bus.off('insider:event', onInsiderEvent)
        bus.off('compliance:ready', onComplianceReady)
        bus.off('community:state', onCommunityState)
        rendererBridgesUnsubscribe = null
    }

    return rendererBridgesUnsubscribe
}

function registerApiKeyHandlers(): void {
    ipcMain.handle(
        IPC_CHANNELS.AI_SET_KEY,
        async (_event, provider: unknown, rawKey: unknown): Promise<{ success: boolean; error?: string }> => {
            enforceScope('ai:set-key', null)
            let key = typeof rawKey === 'string' ? rawKey : null
            try {
                if (typeof provider !== 'string' || !['openai', 'anthropic'].includes(provider)) {
                    return { success: false, error: 'Invalid provider' }
                }
                if (key === null) {
                    return { success: false, error: 'Invalid key format' }
                }

                const settingKey = provider === 'openai' ? 'openaiApiKey' : 'anthropicApiKey'

                if (key.length === 0) {
                    if (injectedDatabase) {
                        injectedDatabase.setSetting(settingKey as keyof UserSettings, '' as never)
                    }
                    settingsStore = { ...settingsStore, [settingKey]: '' }
                    if (injectedEventBus) {
                        injectedEventBus.emit('settings:changed', { key: settingKey, value: '••••••••' })
                    }
                    pushSettingsChanged(settingsStore)
                    return { success: true }
                }

                if (!isApiKeyFormat(key, provider)) {
                    return { success: false, error: `Invalid ${provider} API key format` }
                }

                const encrypted = encryptApiKey(key, provider)
                key = null

                if (injectedDatabase) {
                    injectedDatabase.setEncryptedSetting(settingKey as keyof UserSettings, encrypted)
                }

                settingsStore = { ...settingsStore, [settingKey]: '' }

                if (injectedEventBus) {
                    injectedEventBus.emit('settings:changed', { key: settingKey, value: '••••••••' })
                }

                pushSettingsChanged(settingsStore)
                return { success: true }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to set API key'
                return { success: false, error: message }
            } finally {
                key = null
            }
        },
    )

    ipcMain.handle(
        IPC_CHANNELS.AI_VALIDATE_KEY,
        async (_event, provider: unknown, rawKey: unknown): Promise<KeyValidationResult> => {
            enforceScope('ai:validate-key', null)
            let key = typeof rawKey === 'string' ? rawKey : null
            try {
                if (typeof provider !== 'string' || !['openai', 'anthropic'].includes(provider)) {
                    return { valid: false, provider: String(provider), error: 'Invalid provider' }
                }
                if (key === null || key.length === 0) {
                    return { valid: false, provider, error: 'API key is required' }
                }

                if (!isApiKeyFormat(key, provider)) {
                    return { valid: false, provider, error: `Invalid ${provider} API key format` }
                }

                if (!injectedDatabase) {
                    return { valid: false, provider, error: 'Database not available' }
                }

                let result: { valid: boolean; error?: string }
                if (provider === 'openai') {
                    const openai = new OpenAIProvider(injectedDatabase)
                    result = await openai.validateKey(key)
                } else {
                    const anthropic = new AnthropicProvider(injectedDatabase)
                    result = await anthropic.validateKey(key)
                }

                key = null
                const validationResult: KeyValidationResult = { valid: result.valid, provider }
                if (result.error) {
                    validationResult.error = result.error
                }
                return validationResult
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Validation failed'
                return { valid: false, provider: String(provider), error: message }
            } finally {
                key = null
            }
        },
    )
}

const FALLBACK_VPN_STATUS: VpnLeakStatus = {
    verdict: 'warn',
    tunnelActive: false,
    tunnelInterface: null,
    defaultRouteThroughTunnel: false,
    explanation: 'VPN status is not yet available.',
    timestamp: 0,
}

function registerM1Handlers(): void {
    ipcMain.handle(IPC_CHANNELS.DEVICES_GET, async (): Promise<WifiDevice[]> => {
        enforceScope('devices:get', null)
        return injectedDatabase ? injectedDatabase.getWifiDevices() : []
    })

    ipcMain.handle(
        IPC_CHANNELS.DEVICES_RENAME,
        async (_event, mac: unknown, customName: unknown): Promise<WifiDevice[]> => {
            enforceScope('devices:rename', null)

            if (typeof mac !== 'string' || !/^[0-9A-Fa-f]{12}$/.test(mac.replace(/[^0-9A-Fa-f]/g, ''))) {
                throw new Error('Invalid device MAC')
            }

            const name =
                typeof customName === 'string' ? customName.trim().slice(0, 64) : null

            if (!injectedDatabase) {
                throw new Error('Database not available')
            }

            injectedDatabase.renameWifiDevice(mac.toUpperCase(), name)
            pushDevicesUpdate(injectedDatabase.getWifiDevices())
            return injectedDatabase.getWifiDevices()
        },
    )

    ipcMain.handle(IPC_CHANNELS.DNS_GET, async (): Promise<DnsQueryRecord[]> => {
        enforceScope('dns:get', null)
        return injectedDatabase ? injectedDatabase.getDnsQueries() : []
    })

    ipcMain.handle(IPC_CHANNELS.VPN_STATUS_GET, async (): Promise<VpnLeakStatus> => {
        enforceScope('vpn:status', null)
        if (injectedVpnProvider) return injectedVpnProvider.getCurrentStatus()
        return injectedDatabase?.getLatestVpnStatus() ?? FALLBACK_VPN_STATUS
    })

    ipcMain.handle(IPC_CHANNELS.GEO_GET, async (): Promise<GeoConnection[]> => {
        enforceScope('geo:get', null)
        return injectedGeoProvider ? injectedGeoProvider.getCurrentGeoConnections() : []
    })

    ipcMain.handle(IPC_CHANNELS.IOT_GET, async (): Promise<IotDevice[]> => {
        enforceScope('iot:get', null)
        return injectedIotProvider ? injectedIotProvider.getCurrentIotDevices() : []
    })
}

const EMPTY_FLOW_GRAPH: FlowGraph = { nodes: [], edges: [] }

function registerM2Handlers(): void {
    ipcMain.handle(IPC_CHANNELS.OLLAMA_MODELS, async (_event, endpoint?: unknown): Promise<OllamaModelsResult> => {
        enforceScope('ollama:models', null)
        const ep = typeof endpoint === 'string' ? endpoint : undefined
        if (!injectedOllamaProvider) return { models: [], available: false }
        return injectedOllamaProvider.discoverModels(ep)
    })

    ipcMain.handle(IPC_CHANNELS.REPORTS_GET, async (): Promise<WeeklyReport[]> => {
        enforceScope('reports:get', null)
        return injectedDatabase ? injectedDatabase.getReports() : []
    })

    ipcMain.handle(IPC_CHANNELS.REPORT_GENERATE, async (_event, periodDays?: unknown): Promise<WeeklyReport> => {
        enforceScope('reports:generate', null)
        if (!injectedReportGenerator) {
            throw new Error('[M2] Report generator is not available')
        }
        return injectedReportGenerator.generate(clampPeriodDays(periodDays))
    })

    ipcMain.handle(IPC_CHANNELS.REPORT_EXPORT, async (_event, id: unknown, format: unknown): Promise<string> => {
        enforceScope('reports:export', null)
        if (!injectedDatabase || typeof id !== 'string') return ''
        if (format === 'pdf') {
            return injectedReportPdf ? injectedReportPdf.exportPdf(id) : ''
        }
        const fmt: ReportExportFormat =
            format === 'markdown' || format === 'html' || format === 'csv' ? format : 'json'
        const report = injectedDatabase.getReports().find((r) => r.id === id)
        if (!report) return ''
        return exportReport(report, fmt)
    })

    ipcMain.handle(IPC_CHANNELS.AI_PAYLOAD_GET, async (): Promise<AiPayloadView> => {
        enforceScope('ai:payload', null)
        const connections = injectedMonitor ? injectedMonitor.getPreviousConnections() : []
        const current = anonymize(connections)
        const lastSent = injectedAnalyzer ? injectedAnalyzer.getLastSentPayload() : null
        return { current, lastSent }
    })

    ipcMain.handle(IPC_CHANNELS.FLOW_GET, async (): Promise<FlowGraph> => {
        enforceScope('flow:get', null)
        return injectedFlowProvider ? injectedFlowProvider.getCurrent() : EMPTY_FLOW_GRAPH
    })
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\/\S+$/i.test(value)
}

// Active defense runs OS-level kill/firewall commands. The renderer gates these
// behind a tier lock and a settings switch; enforce both here too, since the
// renderer is not a trust boundary.
// Fail closed: without tier gating we cannot prove the user is entitled, and
// this guard is the trust boundary for OS-level kill/firewall commands.
function assertPaidTier(feature: string): void {
    if (!injectedTierGating || !injectedTierGating.isPaidTier()) {
        throw new Error(`UPGRADE_REQUIRED: ${feature} is a paid feature`)
    }
}

function assertDefenseAllowed(): void {
    assertPaidTier('active defense')
    if (!injectedDatabase || injectedDatabase.getSetting('defenseEnabled') !== true) {
        throw new Error('DEFENSE_DISABLED: enable active defense in Settings first')
    }
}

function registerM3Handlers(): void {
    ipcMain.handle(IPC_CHANNELS.DEFENSE_ACTIONS_GET, async (): Promise<DefenseAction[]> => {
        enforceScope('defense:actions-get', null)
        return injectedDefenseService ? injectedDefenseService.getActions() : []
    })

    ipcMain.handle(IPC_CHANNELS.DEFENSE_KILL_CONFIRM, async (_e, id: unknown, sessionToken?: unknown): Promise<DefenseAction[]> => {
        enforceScope('defense:kill-confirm', sessionToken)
        assertDefenseAllowed()
        if (!injectedDefenseService || typeof id !== 'string') return injectedDefenseService ? injectedDefenseService.getActions() : []
        return injectedDefenseService.confirmKill(id)
    })

    ipcMain.handle(IPC_CHANNELS.DEFENSE_BLOCK_CONFIRM, async (_e, id: unknown, sessionToken?: unknown): Promise<DefenseAction[]> => {
        enforceScope('defense:block-confirm', sessionToken)
        assertDefenseAllowed()
        if (!injectedDefenseService || typeof id !== 'string') return injectedDefenseService ? injectedDefenseService.getActions() : []
        return injectedDefenseService.confirmBlock(id)
    })

    ipcMain.handle(IPC_CHANNELS.DEFENSE_ACTION_CANCEL, async (_e, id: unknown, sessionToken?: unknown): Promise<DefenseAction[]> => {
        enforceScope('defense:action-cancel', sessionToken)
        if (!injectedDefenseService || typeof id !== 'string') return injectedDefenseService ? injectedDefenseService.getActions() : []
        return injectedDefenseService.cancelAction(id)
    })

    ipcMain.handle(IPC_CHANNELS.BLOCKED_IPS_GET, async (): Promise<BlockedIp[]> => {
        enforceScope('defense:blocked-get', null)
        return injectedDefenseService ? injectedDefenseService.getBlockedIps() : []
    })

    // Unblock is not gated on defenseEnabled: turning the feature off must never
    // strand a user behind a firewall rule they can no longer remove.
    ipcMain.handle(IPC_CHANNELS.BLOCKED_IP_UNBLOCK, async (_e, ip: unknown): Promise<BlockedIp[]> => {
        enforceScope('defense:unblock', null)
        assertPaidTier('active defense')
        if (!injectedDefenseService || typeof ip !== 'string') return injectedDefenseService ? injectedDefenseService.getBlockedIps() : []
        return injectedDefenseService.unblock(ip)
    })

    ipcMain.handle(IPC_CHANNELS.RULES_GET, async (): Promise<CustomRule[]> => {
        enforceScope('rules:get', null)
        return injectedRuleEngine ? injectedRuleEngine.getRules() : []
    })

    ipcMain.handle(IPC_CHANNELS.RULES_SAVE, async (_e, rule: unknown, sessionToken?: unknown): Promise<CustomRule[]> => {
        enforceScope('rules:save', sessionToken)
        assertPaidTier('custom rules')
        if (!injectedRuleEngine) return []
        if (!isValidRule(rule)) throw new Error('Invalid rule: needs a name and at least one complete condition')
        return injectedRuleEngine.saveRule(rule)
    })

    ipcMain.handle(IPC_CHANNELS.RULES_DELETE, async (_e, id: unknown, sessionToken?: unknown): Promise<CustomRule[]> => {
        enforceScope('rules:delete', sessionToken)
        assertPaidTier('custom rules')
        if (!injectedRuleEngine) return []
        if (typeof id !== 'string' || id.length === 0) throw new Error('Invalid rule ID')
        return injectedRuleEngine.deleteRule(id)
    })

    ipcMain.handle(IPC_CHANNELS.CERTS_GET, async (): Promise<TlsCertInfo[]> => {
        enforceScope('certs:get', null)
        return injectedCertProvider ? injectedCertProvider.getCerts() : []
    })

    ipcMain.handle(IPC_CHANNELS.BANDWIDTH_GET, async (): Promise<BandwidthSnapshot> => {
        enforceScope('bandwidth:get', null)
        return injectedBandwidthProvider ? injectedBandwidthProvider.getCurrent() : EMPTY_BANDWIDTH_SNAPSHOT
    })

    ipcMain.handle(IPC_CHANNELS.WEBHOOK_TEST, async (_e, url: unknown): Promise<boolean> => {
        enforceScope('webhook:test', null)
        if (!injectedWebhookDispatcher || typeof url !== 'string' || !isHttpUrl(url)) return false
        return injectedWebhookDispatcher.test(url)
    })
}

function registerM4Handlers(): void {
    ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async (): Promise<UpdateStatus> => {
        enforceScope('update:check', null)
        if (!injectedUpdateService) return { kind: 'disabled' }
        await injectedUpdateService.check()
        return injectedUpdateService.getStatus()
    })

    ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async (): Promise<void> => {
        enforceScope('update:download', null)
        if (injectedUpdateService) await injectedUpdateService.download()
    })

    ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async (): Promise<void> => {
        enforceScope('update:install', null)
        if (injectedUpdateService) injectedUpdateService.install()
    })
}

function pushUpdateStatus(status: UpdateStatus): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, status)
    } catch {
        // noop
    }
}

const DEFAULT_REMOTE_STATE: RemoteServerState = {
    enabled: false,
    listening: false,
    host: '127.0.0.1',
    port: 47600,
    agentCount: 0,
}

function registerM5Handlers(): void {
    ipcMain.handle(IPC_CHANNELS.REMOTE_GET_STATE, (): RemoteServerState => {
        enforceScope('remote:get-state', null)
        return injectedRemoteServer?.getState() ?? DEFAULT_REMOTE_STATE
    })

    ipcMain.handle(IPC_CHANNELS.REMOTE_SET_ENABLED, (_e, input: unknown): RemoteServerState => {
        enforceScope('remote:set-enabled', null)
        if (!injectedDatabase || !injectedRemoteServer || typeof input !== 'object' || input === null) {
            return injectedRemoteServer?.getState() ?? DEFAULT_REMOTE_STATE
        }
        const i = input as { enabled?: unknown; token?: unknown }
        if (typeof i.token === 'string' && i.token.length > 0) {
            injectedDatabase.setEncryptedSetting('remoteAuthToken', encryptApiKey(i.token))
        }
        if (typeof i.enabled === 'boolean') {
            injectedDatabase.setSetting('remoteServerEnabled', i.enabled)
            if (i.enabled) injectedRemoteServer.start()
            else injectedRemoteServer.stop()
        }
        return injectedRemoteServer.getState()
    })

    ipcMain.handle(IPC_CHANNELS.REMOTE_SNAPSHOT, (): RemoteSnapshot => {
        enforceScope('remote:snapshot', null)
        return {
            serverState: injectedRemoteServer?.getState() ?? DEFAULT_REMOTE_STATE,
            agents: injectedRemoteServer?.getAgents() ?? [],
            events: injectedRemoteServer?.getRecentEvents() ?? [],
            lanAddress: localIpv4(),
        }
    })

    ipcMain.handle(IPC_CHANNELS.PAGERDUTY_GET_STATE, (): PagerDutyState => {
        enforceScope('pagerduty:get-state', null)
        const enabled = injectedDatabase?.getSetting('pagerDutyEnabled') ?? false
        const floor = (injectedDatabase?.getSetting('pagerDutySeverityFloor') ?? 'critical') as ThreatLevel
        return { enabled, configured: injectedPagerDuty?.isConfigured() ?? false, severityFloor: floor }
    })

    ipcMain.handle(IPC_CHANNELS.PAGERDUTY_SET, (_e, input: unknown): PagerDutyState => {
        enforceScope('pagerduty:set', null)
        const fallback: PagerDutyState = { enabled: false, configured: false, severityFloor: 'critical' }
        if (!injectedDatabase || typeof input !== 'object' || input === null) return fallback
        const i = input as { enabled?: unknown; routingKey?: unknown; severityFloor?: unknown }
        if (typeof i.routingKey === 'string' && i.routingKey.length > 0) {
            injectedDatabase.setEncryptedSetting('pagerDutyRoutingKey', encryptApiKey(i.routingKey))
            injectedDatabase.setSetting('pagerDutyVerified', false)
        }
        if (typeof i.severityFloor === 'string' && ['safe', 'info', 'warning', 'danger', 'critical'].includes(i.severityFloor)) {
            injectedDatabase.setSetting('pagerDutySeverityFloor', i.severityFloor as ThreatLevel)
        }
        if (typeof i.enabled === 'boolean') {
            injectedDatabase.setSetting('pagerDutyEnabled', i.enabled)
        }
        const floor = injectedDatabase.getSetting('pagerDutySeverityFloor') as ThreatLevel
        return {
            enabled: injectedDatabase.getSetting('pagerDutyEnabled'),
            configured: injectedPagerDuty?.isConfigured() ?? false,
            severityFloor: floor,
        }
    })

    ipcMain.handle(IPC_CHANNELS.PAGERDUTY_TEST, async (_e, routingKey: unknown): Promise<boolean> => {
        enforceScope('pagerduty:test', null)
        if (typeof routingKey !== 'string' || !injectedPagerDuty) return false
        const ok = await injectedPagerDuty.test(routingKey)
        if (ok && injectedDatabase) {
            injectedDatabase.setEncryptedSetting('pagerDutyRoutingKey', encryptApiKey(routingKey))
            injectedDatabase.setSetting('pagerDutyVerified', true)
        }
        return ok
    })
}

const DEFAULT_REST_STATE: RestApiState = { enabled: false, listening: false, host: '127.0.0.1', port: 47700 }
const DEFAULT_SIEM_STATE: SiemState = { enabled: false, configured: false, verified: false, vendor: 'splunk', severityFloor: 'warning' }

function enforceScope(channel: string, sessionToken: unknown): void {
    if (!injectedSessionService || !injectedSessionService.isRbacActive()) return
    const scope = requiredScopeFor(channel)
    if (scope === null) return
    const explicit = typeof sessionToken === 'string' && sessionToken.length > 0 ? sessionToken : null
    const token = explicit ?? activeSessionToken ?? ''
    const resolved = injectedSessionService.resolve(token)
    if (!resolved) {
        throw new Error('FORBIDDEN: authentication required')
    }
    if (!hasScope(resolved.role, scope)) {
        throw new Error(`FORBIDDEN: role ${resolved.role} lacks scope ${scope}`)
    }
}

function setActiveSession(token: string | null): void {
    activeSessionToken = token
}

const RBAC_GOVERNED_SETTINGS = new Set<keyof UserSettings>([
    'rbacEnabled',
    'restApiEnabled',
    'restApiPort',
    'siemEnabled',
    'siemVendor',
    'siemEndpoint',
    'siemSeverityFloor',
    'insiderThreatEnabled',
    'defenseEnabled',
    'webhookEnabled',
    'pagerDutyEnabled',
    'pagerDutySeverityFloor',
    'remoteServerEnabled',
    'remoteServerHost',
    'remoteServerPort',
    'remoteServerTlsEnabled',
    'remoteServerCertPath',
    'remoteServerKeyPath',
    'threatIntelEnabled',
    'threatIntelEndpoint',
    'threatIntelSeverityFloor',
    'tier',
    'licenseKey',
])

function enforceSettingsScope(partial: Partial<UserSettings>, sessionToken: unknown): ReturnType<typeof createIpcError> | null {
    if (partial.rbacEnabled === true && injectedSessionService && injectedSessionService.listUsers().filter((u) => !u.disabled).length === 0) {
        return createIpcError('FORBIDDEN', 'Create an admin user before enabling role-based access control')
    }
    if (!injectedSessionService || !injectedSessionService.isRbacActive()) return null
    const touchesGoverned = Object.keys(partial).some((k) => RBAC_GOVERNED_SETTINGS.has(k as keyof UserSettings))
    if (!touchesGoverned) return null
    // Fall back to the active session like enforceScope does. Most settings
    // callers don't thread a token; the role's scope is still checked below.
    const explicit = typeof sessionToken === 'string' && sessionToken.length > 0 ? sessionToken : null
    const resolved = injectedSessionService.resolve(explicit ?? activeSessionToken ?? '')
    if (!resolved) {
        return createIpcError('FORBIDDEN', 'Authentication required to change protected settings')
    }
    const needsUserScope = 'rbacEnabled' in partial
    const ok = needsUserScope ? hasScope(resolved.role, 'manage-users') : hasScope(resolved.role, 'manage-settings')
    if (!ok) {
        return createIpcError('FORBIDDEN', `Role ${resolved.role} cannot change protected settings`)
    }
    return null
}

function currentSiemState(): SiemState {
    if (!injectedDatabase) return DEFAULT_SIEM_STATE
    return {
        enabled: injectedDatabase.getSetting('siemEnabled'),
        configured: injectedSiemDispatcher?.isConfigured() ?? false,
        verified: injectedDatabase.getSetting('siemVerified'),
        vendor: injectedDatabase.getSetting('siemVendor'),
        severityFloor: injectedDatabase.getSetting('siemSeverityFloor'),
    }
}

function registerM6Handlers(): void {
    ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, (_e, username: unknown, password: unknown): SessionInfo | null => {
        if (!injectedSessionService || typeof username !== 'string' || typeof password !== 'string') return null
        const session = injectedSessionService.login(username, password)
        if (session) setActiveSession(session.token)
        return session
    })

    ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, (_e, token: unknown): void => {
        if (injectedSessionService && typeof token === 'string') injectedSessionService.logout(token)
        if (typeof token === 'string' && token === activeSessionToken) setActiveSession(null)
    })

    ipcMain.handle(IPC_CHANNELS.AUTH_SESSION, (_e, token: unknown): SessionInfo | null => {
        if (!injectedSessionService || typeof token !== 'string') return null
        return injectedSessionService.resolveSession(token)
    })

    ipcMain.handle(IPC_CHANNELS.USERS_LIST, (_e, sessionToken: unknown): AppUser[] => {
        enforceScope('users:list', sessionToken)
        return injectedSessionService?.listUsers() ?? []
    })

    ipcMain.handle(IPC_CHANNELS.USERS_CREATE, (_e, sessionToken: unknown, input: unknown): AppUser[] => {
        enforceScope('users:create', sessionToken)
        if (!injectedSessionService || typeof input !== 'object' || input === null) return injectedSessionService?.listUsers() ?? []
        const i = input as { username?: unknown; password?: unknown; role?: unknown }
        if (typeof i.username !== 'string' || typeof i.password !== 'string' || typeof i.role !== 'string' || !['admin', 'manager', 'observer'].includes(i.role)) {
            return injectedSessionService.listUsers()
        }
        injectedSessionService.createUser(i.username, i.password, i.role as Role)
        return injectedSessionService.listUsers()
    })

    ipcMain.handle(IPC_CHANNELS.USERS_SET_DISABLED, (_e, sessionToken: unknown, id: unknown, disabled: unknown): AppUser[] => {
        enforceScope('users:set-disabled', sessionToken)
        if (!injectedSessionService || typeof id !== 'string' || typeof disabled !== 'boolean') return injectedSessionService?.listUsers() ?? []
        return injectedSessionService.setUserDisabled(id, disabled)
    })

    ipcMain.handle(IPC_CHANNELS.USERS_DELETE, (_e, sessionToken: unknown, id: unknown): AppUser[] => {
        enforceScope('users:delete', sessionToken)
        if (!injectedSessionService || typeof id !== 'string') return injectedSessionService?.listUsers() ?? []
        return injectedSessionService.deleteUser(id)
    })

    ipcMain.handle(IPC_CHANNELS.REST_GET_STATE, (): RestApiState => {
        enforceScope('rest:get-state', null)
        return injectedRestApiServer?.getState() ?? DEFAULT_REST_STATE
    })

    ipcMain.handle(IPC_CHANNELS.REST_SET, (_e, sessionToken: unknown, input: unknown): RestApiState => {
        enforceScope('rest:set', sessionToken)
        if (!injectedDatabase || !injectedRestApiServer || typeof input !== 'object' || input === null) {
            return injectedRestApiServer?.getState() ?? DEFAULT_REST_STATE
        }
        const i = input as { enabled?: unknown; port?: unknown; token?: unknown }
        if (typeof i.token === 'string' && i.token.length > 0) {
            injectedDatabase.setEncryptedSetting('restApiToken', encryptApiKey(i.token))
        }
        if (typeof i.port === 'number' && Number.isInteger(i.port) && i.port >= 1024 && i.port <= 65535) {
            injectedDatabase.setSetting('restApiPort', i.port)
        }
        if (typeof i.enabled === 'boolean') {
            injectedDatabase.setSetting('restApiEnabled', i.enabled)
        }
        injectedRestApiServer.restart()
        return injectedRestApiServer.getState()
    })

    ipcMain.handle(IPC_CHANNELS.SIEM_GET_STATE, (): SiemState => {
        enforceScope('siem:get-state', null)
        return currentSiemState()
    })

    ipcMain.handle(IPC_CHANNELS.SIEM_SET, (_e, sessionToken: unknown, input: unknown): SiemState => {
        enforceScope('siem:set', sessionToken)
        if (!injectedDatabase || typeof input !== 'object' || input === null) return currentSiemState()
        const i = input as { enabled?: unknown; vendor?: unknown; endpoint?: unknown; token?: unknown; severityFloor?: unknown }
        if (typeof i.vendor === 'string' && ['splunk', 'elastic', 'datadog'].includes(i.vendor)) {
            injectedDatabase.setSetting('siemVendor', i.vendor as SiemVendor)
            injectedDatabase.setSetting('siemVerified', false)
        }
        if (typeof i.endpoint === 'string') {
            injectedDatabase.setSetting('siemEndpoint', i.endpoint)
            injectedDatabase.setSetting('siemVerified', false)
        }
        if (typeof i.token === 'string' && i.token.length > 0) {
            injectedDatabase.setEncryptedSetting('siemToken', encryptApiKey(i.token))
            injectedDatabase.setSetting('siemVerified', false)
        }
        if (typeof i.severityFloor === 'string' && ['safe', 'info', 'warning', 'danger', 'critical'].includes(i.severityFloor)) {
            injectedDatabase.setSetting('siemSeverityFloor', i.severityFloor as ThreatLevel)
        }
        if (typeof i.enabled === 'boolean') {
            injectedDatabase.setSetting('siemEnabled', i.enabled)
        }
        return currentSiemState()
    })

    ipcMain.handle(IPC_CHANNELS.SIEM_TEST, async (_e, sessionToken: unknown, input: unknown): Promise<boolean> => {
        enforceScope('siem:test', sessionToken)
        if (!injectedSiemDispatcher || !injectedDatabase || typeof input !== 'object' || input === null) return false
        const i = input as { vendor?: unknown; endpoint?: unknown; token?: unknown }
        if (typeof i.vendor !== 'string' || !['splunk', 'elastic', 'datadog'].includes(i.vendor) || typeof i.endpoint !== 'string' || typeof i.token !== 'string') return false
        const ok = await injectedSiemDispatcher.test(i.vendor as SiemVendor, i.endpoint, i.token)
        if (ok) {
            injectedDatabase.setSetting('siemVendor', i.vendor as SiemVendor)
            injectedDatabase.setSetting('siemEndpoint', i.endpoint)
            if (i.token.length > 0) injectedDatabase.setEncryptedSetting('siemToken', encryptApiKey(i.token))
            injectedDatabase.setSetting('siemVerified', true)
        }
        return ok
    })

    ipcMain.handle(IPC_CHANNELS.COMPLIANCE_GENERATE, (_e, sessionToken: unknown, framework: unknown): ComplianceReport | null => {
        enforceScope('compliance:generate', sessionToken)
        if (!injectedComplianceService || typeof framework !== 'string' || !['soc2', 'iso27001', 'pci', 'hipaa', 'gdpr'].includes(framework)) return null
        return injectedComplianceService.generate(framework as ComplianceFramework)
    })

    ipcMain.handle(IPC_CHANNELS.COMPLIANCE_EXPORT_PDF, async (_e, sessionToken: unknown, framework: unknown): Promise<string> => {
        enforceScope('compliance:export-pdf', sessionToken)
        if (!injectedComplianceService || typeof framework !== 'string' || !['soc2', 'iso27001', 'pci', 'hipaa', 'gdpr'].includes(framework)) return ''
        return injectedComplianceService.exportPdf(framework as ComplianceFramework)
    })

    ipcMain.handle(IPC_CHANNELS.COMPLIANCE_GET, (): ComplianceReport | null => {
        enforceScope('compliance:get', null)
        return injectedComplianceService?.getLast() ?? null
    })

    ipcMain.handle(IPC_CHANNELS.INSIDER_GET_STATE, (): InsiderThreatState => {
        enforceScope('insider:get-state', null)
        const enabled = injectedDatabase?.getSetting('insiderThreatEnabled') ?? false
        return { enabled, recentEvents: injectedInsiderService?.getRecentEvents() ?? [] }
    })
}

const DEFAULT_COMMUNITY_STATE: CommunityState = { enabled: false, configured: false, verified: false, severityFloor: 'warning', submittedCount: 0, lastSubmittedAt: null }

/**
 * `community:*` writes settings directly rather than through `settings:update`,
 * so nothing refreshes the renderer's settings store. Mirror + push the keys the
 * UI reads back, otherwise the endpoint field stays empty after a save.
 */
function pushThreatIntelSettings(): void {
    if (!injectedDatabase) return
    settingsStore = {
        ...settingsStore,
        threatIntelEnabled: injectedDatabase.getSetting('threatIntelEnabled'),
        threatIntelEndpoint: injectedDatabase.getSetting('threatIntelEndpoint'),
        threatIntelVerified: injectedDatabase.getSetting('threatIntelVerified'),
        threatIntelSeverityFloor: injectedDatabase.getSetting('threatIntelSeverityFloor'),
    }
    pushSettingsChanged(settingsStore)
}

function registerM7Handlers(): void {
    ipcMain.handle(IPC_CHANNELS.COMMUNITY_GET_STATE, (): CommunityState => {
        enforceScope('community:get-state', null)
        return injectedThreatIntelDispatcher?.getState() ?? DEFAULT_COMMUNITY_STATE
    })

    ipcMain.handle(IPC_CHANNELS.COMMUNITY_SET_ENABLED, (_e, enabled: unknown, sessionToken: unknown): CommunityState => {
        enforceScope('community:set-enabled', sessionToken)
        if (!injectedThreatIntelDispatcher || typeof enabled !== 'boolean') {
            return injectedThreatIntelDispatcher?.getState() ?? DEFAULT_COMMUNITY_STATE
        }
        const next = injectedThreatIntelDispatcher.setEnabled(enabled)
        pushThreatIntelSettings()
        return next
    })

    ipcMain.handle(IPC_CHANNELS.COMMUNITY_SET_CONFIG, (_e, cfg: unknown, sessionToken: unknown): CommunityState => {
        enforceScope('community:set-config', sessionToken)
        if (!injectedThreatIntelDispatcher || !injectedDatabase || typeof cfg !== 'object' || cfg === null) {
            return injectedThreatIntelDispatcher?.getState() ?? DEFAULT_COMMUNITY_STATE
        }
        const c = cfg as { endpoint?: unknown; key?: unknown; severityFloor?: unknown }
        const endpoint = typeof c.endpoint === 'string' ? c.endpoint : ''
        const severityFloor = typeof c.severityFloor === 'string' && ['safe', 'info', 'warning', 'danger', 'critical'].includes(c.severityFloor) ? (c.severityFloor as ThreatLevel) : injectedDatabase.getSetting('threatIntelSeverityFloor')
        if (typeof c.key === 'string' && c.key.length > 0) {
            injectedDatabase.setEncryptedSetting('threatIntelKey', encryptApiKey(c.key))
        }
        const next = injectedThreatIntelDispatcher.setConfig({ endpoint, severityFloor })
        pushThreatIntelSettings()
        return next
    })

    ipcMain.handle(IPC_CHANNELS.COMMUNITY_TEST, async (_e, endpoint: unknown, key: unknown, sessionToken: unknown): Promise<boolean> => {
        enforceScope('community:test', sessionToken)
        if (!injectedThreatIntelDispatcher || !injectedDatabase || typeof endpoint !== 'string' || typeof key !== 'string') return false
        // A blank key means "keep the stored one" — resolved inside the dispatcher.
        const ok = await injectedThreatIntelDispatcher.test(endpoint, key)
        if (ok) {
            injectedDatabase.setSetting('threatIntelEndpoint', endpoint)
            if (key.length > 0) injectedDatabase.setEncryptedSetting('threatIntelKey', encryptApiKey(key))
            // test() emits before the endpoint lands, so `configured` would lag a push.
            pushCommunityState(injectedThreatIntelDispatcher.getState())
            pushThreatIntelSettings()
        }
        return ok
    })

    ipcMain.handle(IPC_CHANNELS.COMMUNITY_PREVIEW, (): ThreatIntelSubmission[] => {
        enforceScope('community:preview', null)
        if (!injectedThreatIntelDispatcher || !injectedDatabase) return []
        const recent = injectedDatabase.getRecentAlerts(25)
        return injectedThreatIntelDispatcher.previewBatch(recent)
    })
}

function pushCommunityState(state: CommunityState): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.COMMUNITY_STATE, state)
    } catch {
        // noop
    }
}

function pushUsersChanged(users: AppUser[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.USERS_CHANGED, users)
    } catch {
        // noop
    }
}

function pushRestState(state: RestApiState): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.REST_STATE, state)
    } catch {
        // noop
    }
}

function pushSiemState(state: SiemState): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.SIEM_STATE, state)
    } catch {
        // noop
    }
}

function pushInsiderEvent(event: InsiderThreatEvent): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.INSIDER_EVENT, event)
    } catch {
        // noop
    }
}

function pushComplianceReady(report: ComplianceReport): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.COMPLIANCE_READY, report)
    } catch {
        // noop
    }
}

function pushRemoteAgents(agents: RemoteAgentInfo[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.REMOTE_AGENTS, agents)
    } catch {
        // noop
    }
}

function pushRemoteEvent(item: RemoteEventItem): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.REMOTE_EVENTS, item)
    } catch {
        // noop
    }
}

function pushRemoteServerState(state: RemoteServerState): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.REMOTE_SERVER_STATE, state)
    } catch {
        // noop
    }
}

function pushDefenseActionsUpdate(actions: DefenseAction[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.DEFENSE_ACTIONS_UPDATE, actions)
    } catch {
        // noop
    }
}

function pushCertsUpdate(certs: TlsCertInfo[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.CERTS_UPDATE, certs)
    } catch {
        // noop
    }
}

function pushBandwidthUpdate(snapshot: BandwidthSnapshot): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.BANDWIDTH_UPDATE, snapshot)
    } catch {
        // noop
    }
}

function pushReportsUpdate(reports: WeeklyReport[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.REPORTS_UPDATE, reports)
    } catch {
        // noop
    }
}

function pushFlowUpdate(graph: FlowGraph): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.FLOW_UPDATE, graph)
    } catch {
        // noop
    }
}

function pushDevicesUpdate(devices: WifiDevice[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.DEVICES_UPDATE, devices)
    } catch {
        // noop
    }
}

function pushDnsUpdate(records: DnsQueryRecord[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.DNS_UPDATE, records)
    } catch {
        // noop
    }
}

function pushVpnUpdate(status: VpnLeakStatus): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.VPN_STATUS_UPDATE, status)
    } catch {
        // noop
    }
}

function pushGeoUpdate(connections: GeoConnection[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.GEO_UPDATE, connections)
    } catch {
        // noop
    }
}

function pushIotUpdate(devices: IotDevice[]): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.IOT_UPDATE, devices)
    } catch {
        // noop
    }
}

function registerAllHandlers(): void {
    if (handlersRegistered) return
    handlersRegistered = true

    registerConnectionHandlers()
    registerScanControlHandlers()
    registerSettingsHandlers()
    registerStatsAndAppHandlers()
    registerAlertHandlers()
    registerWhitelistHandlers()
    registerAIHandlers()
    registerTierInfoHandler()
    registerApiKeyHandlers()
    registerM1Handlers()
    registerM2Handlers()
    registerM3Handlers()
    registerM4Handlers()
    registerM5Handlers()
    registerM6Handlers()
    registerM7Handlers()
    registerLicenseHandlers()
}

/**
 * The signed license is the source of truth for the tier; `settings.tier` is a
 * cached mirror the renderer gates on. Nothing else may write it — `settings:update`
 * rejects `tier` outright — so it must be re-derived whenever the license changes
 * and at boot (a license can expire while the app is closed).
 */
function syncTierFromLicense(): SubscriptionTier {
    if (!injectedDatabase || !injectedTierGating) return 'free'
    const tier = injectedTierGating.getVerifiedTier().tier
    if (injectedDatabase.getSetting('tier') !== tier) {
        injectedDatabase.setSetting('tier', tier)
        settingsStore = { ...settingsStore, tier }
        pushSettingsChanged(settingsStore)
    }
    return tier
}

function registerLicenseHandlers(): void {
    syncTierFromLicense()

    ipcMain.handle(IPC_CHANNELS.LICENSE_ACTIVATE, (_e, licenseKey: unknown): { success: boolean; status: LicenseStatus; error?: string } => {
        if (typeof licenseKey !== 'string') {
            return { success: false, status: toLicenseStatus(FREE_TIER), error: 'License key must be a string' }
        }
        if (!injectedDatabase || !injectedTierGating) {
            return { success: false, status: toLicenseStatus(FREE_TIER), error: 'Service unavailable' }
        }
        try {
            injectedDatabase.setEncryptedSetting('licenseKey', encrypt(licenseKey.trim()))
            const verified = injectedTierGating.getVerifiedTier()
            syncTierFromLicense()
            pushLicenseChanged(toLicenseStatus(verified))
            if (verified.valid) {
                return { success: true, status: toLicenseStatus(verified) }
            }
            return { success: false, status: toLicenseStatus(verified), error: humanizeLicenseReason(verified.reason) }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to activate license'
            return { success: false, status: toLicenseStatus(FREE_TIER), error: message }
        }
    })

    ipcMain.handle(IPC_CHANNELS.LICENSE_STATUS, (): LicenseStatus => {
        if (!injectedTierGating) return toLicenseStatus(FREE_TIER)
        return toLicenseStatus(injectedTierGating.getVerifiedTier())
    })
}

function humanizeLicenseReason(reason: string): string {
    switch (reason) {
        case 'bad-signature': return 'License signature is invalid or the key was tampered with'
        case 'expired': return 'License has expired'
        case 'wrong-machine': return 'License is bound to a different machine'
        case 'wrong-product': return 'License is not for this product'
        case 'malformed': return 'License key is malformed'
        case 'no-license': return 'No license key provided'
        default: return `License is not valid (${reason})`
    }
}

function pushLicenseChanged(status: LicenseStatus): void {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
        mainWindow.webContents.send(IPC_CHANNELS.LICENSE_CHANGED, status)
    } catch {
        // noop
    }
}

function updateCachedConnections(connections: NetworkConnection[]): void {
    cachedConnections = connections
    monitoringState.connectionCount = connections.length
    pushConnectionsUpdate(connections)
}

function getCachedConnections(): NetworkConnection[] {
    return cachedConnections
}

function updateSettings(settings: UserSettings): void {
    settingsStore = { ...settings }
}

function resetIpcRegistrationState(): void {
    handlersRegistered = false
    rendererBridgesUnsubscribe = null
    activeSessionToken = null
    // injectServices() only ever assigns, so a leaked tierGating would make the
    // next registerAllHandlers() sync against the previous test's license.
    injectedTierGating = null
}

function getMonitoringState(): typeof monitoringState {
    return { ...monitoringState }
}

export {
    registerAllHandlers,
    pushConnectionsUpdate,
    pushSettingsChanged,
    pushScanStatusUpdate,
    pushNewAlert,
    pushAnalysisUpdate,
    pushLearningStatus,
    pushWhitelistUpdate,
    handleScanError,
    wireRendererBridges,
    updateCachedConnections,
    getCachedConnections,
    updateSettings,
    getMonitoringState,
    injectServices,
    resetIpcRegistrationState,
}

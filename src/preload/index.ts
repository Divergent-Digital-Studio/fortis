import { contextBridge, ipcRenderer } from 'electron'
import type { FortisAPI } from '@shared/types/ipc'
import { IPC_CHANNELS } from '@shared/types/ipc'
import type { AIStatusInfo, TierInfo, LearningStatusPayload, KeyValidationResult, ScanStatusPayload, IpcWriteResult } from '@shared/types/ipc'
import type { UserSettings, LicenseStatus } from '@shared/types/settings'
import type { NetworkConnection, ConnectionStats, TimeSeriesPoint } from '@shared/types/connection'
import type { Alert, AlertFilters, AlertCounts } from '@shared/types/alert'
import type { AIAnalysisResult, AIUsageStats } from '@shared/types/analysis'
import type { WhitelistEntry } from '@shared/types/whitelist'
import type { WifiDevice, DnsQueryRecord, VpnLeakStatus, GeoConnection, IotDevice } from '@shared/types/m1'
import type { WeeklyReport, ReportExportFormat, AiPayloadView, FlowGraph, OllamaModelsResult } from '@shared/types/m2'
import type { DefenseAction, BlockedIp, CustomRule, TlsCertInfo, BandwidthSnapshot } from '@shared/types/m3'
import type { UpdateStatus } from '@shared/types/m4'
import type { RemoteAgentInfo, RemoteEventItem, RemoteServerState, RemoteSnapshot, PagerDutyState } from '@shared/types/m5'
import type { AppUser, SessionInfo, RestApiState, SiemState, SiemVendor, ComplianceFramework, ComplianceReport, InsiderThreatState, InsiderThreatEvent, Role } from '@shared/types/m6'
import type { CommunityState, ThreatIntelSubmission } from '@shared/types/m7'
import type { ThreatLevel } from '@shared/types/analysis'

const fortisAPI: FortisAPI = {
    getConnections: (): Promise<NetworkConnection[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_GET),

    triggerScan: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.SCAN_TRIGGER),

    pauseMonitoring: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.MONITOR_PAUSE),

    resumeMonitoring: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.MONITOR_RESUME),

    getMonitoringStatus: () =>
        ipcRenderer.invoke(IPC_CHANNELS.MONITOR_STATUS),

    getSettings: (): Promise<UserSettings> =>
        ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

    updateSettings: (settings: Partial<UserSettings>, sessionToken?: string): Promise<IpcWriteResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings, sessionToken),

    onConnectionsUpdate: (callback: (connections: NetworkConnection[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, connections: NetworkConnection[]): void => {
            callback(connections)
        }
        ipcRenderer.on(IPC_CHANNELS.CONNECTIONS_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.CONNECTIONS_UPDATE, handler)
        }
    },

    onSettingsChanged: (callback: (settings: UserSettings) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, settings: UserSettings): void => {
            callback(settings)
        }
        ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, handler)
        }
    },

    onNavigateTo: (callback: (view: string) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, view: string): void => {
            callback(view)
        }
        ipcRenderer.on(IPC_CHANNELS.NAVIGATE_TO, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.NAVIGATE_TO, handler)
        }
    },

    onScanStatus: (callback: (status: ScanStatusPayload) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, status: ScanStatusPayload): void => {
            callback(status)
        }
        ipcRenderer.on(IPC_CHANNELS.SCAN_STATUS_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.SCAN_STATUS_UPDATE, handler)
        }
    },

    getConnectionTimeline: (from: number, to: number): Promise<TimeSeriesPoint[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.STATS_CONNECTION_TIMELINE, from, to),

    getConnectionStats: (): Promise<ConnectionStats> =>
        ipcRenderer.invoke(IPC_CHANNELS.STATS_CONNECTION_STATS),

    getAlerts: (filtersOrLimit?: AlertFilters | number): Promise<Alert[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.ALERTS_GET, filtersOrLimit),

    onNewAlert: (callback: (alert: Alert) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, alert: Alert): void => {
            callback(alert)
        }
        ipcRenderer.on(IPC_CHANNELS.ALERT_NEW, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.ALERT_NEW, handler)
        }
    },

    getAppVersion: (): Promise<string> =>
        ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

    getPlatform: (): Promise<NodeJS.Platform> =>
        ipcRenderer.invoke(IPC_CHANNELS.APP_PLATFORM),

    triggerAIAnalysis: (): Promise<AIAnalysisResult | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.AI_ANALYZE),

    getAIStatus: (): Promise<AIStatusInfo> =>
        ipcRenderer.invoke(IPC_CHANNELS.AI_STATUS),

    getAIUsage: (): Promise<AIUsageStats> =>
        ipcRenderer.invoke(IPC_CHANNELS.AI_USAGE),

    getLastAnalysis: (): Promise<AIAnalysisResult | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.AI_LAST_ANALYSIS),

    getRecentAlerts: (limit?: number): Promise<Alert[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.ALERTS_RECENT, limit),

    acknowledgeAlert: (id: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.ALERTS_ACKNOWLEDGE, id),

    getAlertCounts: (): Promise<AlertCounts> =>
        ipcRenderer.invoke(IPC_CHANNELS.ALERTS_COUNTS),

    getWhitelist: (): Promise<WhitelistEntry[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.WHITELIST_GET),

    addToWhitelist: (entry: Omit<WhitelistEntry, 'id' | 'createdAt'>): Promise<string> =>
        ipcRenderer.invoke(IPC_CHANNELS.WHITELIST_ADD, entry),

    removeFromWhitelist: (id: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.WHITELIST_REMOVE, id),

    exportWhitelist: (): Promise<WhitelistEntry[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.WHITELIST_EXPORT),

    importWhitelist: (entries: WhitelistEntry[]): Promise<{ imported: number; skipped: number }> =>
        ipcRenderer.invoke(IPC_CHANNELS.WHITELIST_IMPORT, entries),

    onWhitelistUpdate: (callback: (entries: WhitelistEntry[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, entries: WhitelistEntry[]): void => {
            callback(entries)
        }
        ipcRenderer.on(IPC_CHANNELS.WHITELIST_UPDATED, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.WHITELIST_UPDATED, handler)
        }
    },

    getTierInfo: (): Promise<TierInfo> =>
        ipcRenderer.invoke(IPC_CHANNELS.TIER_INFO),

    onAnalysisUpdate: (callback: (result: AIAnalysisResult) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, result: AIAnalysisResult): void => {
            callback(result)
        }
        ipcRenderer.on(IPC_CHANNELS.AI_ANALYSIS_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.AI_ANALYSIS_UPDATE, handler)
        }
    },

    onLearningStatus: (callback: (status: LearningStatusPayload) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, status: LearningStatusPayload): void => {
            callback(status)
        }
        ipcRenderer.on(IPC_CHANNELS.LEARNING_STATUS, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.LEARNING_STATUS, handler)
        }
    },

    setApiKey: (provider: string, key: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.AI_SET_KEY, provider, key),

    validateApiKey: (provider: string, key: string): Promise<KeyValidationResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.AI_VALIDATE_KEY, provider, key),

    getDevices: (): Promise<WifiDevice[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DEVICES_GET),

    renameDevice: (mac: string, customName: string | null): Promise<WifiDevice[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DEVICES_RENAME, mac, customName),

    onDevicesUpdate: (callback: (devices: WifiDevice[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, devices: WifiDevice[]): void => {
            callback(devices)
        }
        ipcRenderer.on(IPC_CHANNELS.DEVICES_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.DEVICES_UPDATE, handler)
        }
    },

    getDnsQueries: (): Promise<DnsQueryRecord[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DNS_GET),

    onDnsUpdate: (callback: (records: DnsQueryRecord[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, records: DnsQueryRecord[]): void => {
            callback(records)
        }
        ipcRenderer.on(IPC_CHANNELS.DNS_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.DNS_UPDATE, handler)
        }
    },

    getVpnStatus: (): Promise<VpnLeakStatus> =>
        ipcRenderer.invoke(IPC_CHANNELS.VPN_STATUS_GET),

    onVpnUpdate: (callback: (status: VpnLeakStatus) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, status: VpnLeakStatus): void => {
            callback(status)
        }
        ipcRenderer.on(IPC_CHANNELS.VPN_STATUS_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.VPN_STATUS_UPDATE, handler)
        }
    },

    getGeoConnections: (): Promise<GeoConnection[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.GEO_GET),

    onGeoUpdate: (callback: (connections: GeoConnection[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, connections: GeoConnection[]): void => {
            callback(connections)
        }
        ipcRenderer.on(IPC_CHANNELS.GEO_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.GEO_UPDATE, handler)
        }
    },

    getIotDevices: (): Promise<IotDevice[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.IOT_GET),

    onIotUpdate: (callback: (devices: IotDevice[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, devices: IotDevice[]): void => {
            callback(devices)
        }
        ipcRenderer.on(IPC_CHANNELS.IOT_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.IOT_UPDATE, handler)
        }
    },

    getReports: (): Promise<WeeklyReport[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET),

    generateReport: (periodDays?: number): Promise<WeeklyReport> =>
        ipcRenderer.invoke(IPC_CHANNELS.REPORT_GENERATE, periodDays),

    exportReport: (id: string, format: ReportExportFormat): Promise<string> =>
        ipcRenderer.invoke(IPC_CHANNELS.REPORT_EXPORT, id, format),

    onReportsUpdate: (callback: (reports: WeeklyReport[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, reports: WeeklyReport[]): void => {
            callback(reports)
        }
        ipcRenderer.on(IPC_CHANNELS.REPORTS_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.REPORTS_UPDATE, handler)
        }
    },

    getAiPayload: (): Promise<AiPayloadView> =>
        ipcRenderer.invoke(IPC_CHANNELS.AI_PAYLOAD_GET),

    getFlowGraph: (): Promise<FlowGraph> =>
        ipcRenderer.invoke(IPC_CHANNELS.FLOW_GET),

    onFlowUpdate: (callback: (graph: FlowGraph) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, graph: FlowGraph): void => {
            callback(graph)
        }
        ipcRenderer.on(IPC_CHANNELS.FLOW_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.FLOW_UPDATE, handler)
        }
    },

    discoverOllamaModels: (endpoint?: string): Promise<OllamaModelsResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.OLLAMA_MODELS, endpoint),

    getDefenseActions: (): Promise<DefenseAction[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DEFENSE_ACTIONS_GET),

    onDefenseActionsUpdate: (callback: (actions: DefenseAction[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, actions: DefenseAction[]): void => {
            callback(actions)
        }
        ipcRenderer.on(IPC_CHANNELS.DEFENSE_ACTIONS_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.DEFENSE_ACTIONS_UPDATE, handler)
        }
    },

    confirmKill: (actionId: string): Promise<DefenseAction[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DEFENSE_KILL_CONFIRM, actionId),

    confirmBlock: (actionId: string): Promise<DefenseAction[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DEFENSE_BLOCK_CONFIRM, actionId),

    cancelDefenseAction: (actionId: string): Promise<DefenseAction[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DEFENSE_ACTION_CANCEL, actionId),

    getBlockedIps: (): Promise<BlockedIp[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.BLOCKED_IPS_GET),

    unblockIp: (ip: string): Promise<BlockedIp[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.BLOCKED_IP_UNBLOCK, ip),

    getRules: (): Promise<CustomRule[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.RULES_GET),

    saveRule: (rule: CustomRule): Promise<CustomRule[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.RULES_SAVE, rule),

    deleteRule: (id: string): Promise<CustomRule[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.RULES_DELETE, id),

    getCerts: (): Promise<TlsCertInfo[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.CERTS_GET),

    onCertsUpdate: (callback: (certs: TlsCertInfo[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, certs: TlsCertInfo[]): void => {
            callback(certs)
        }
        ipcRenderer.on(IPC_CHANNELS.CERTS_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.CERTS_UPDATE, handler)
        }
    },

    getBandwidth: (): Promise<BandwidthSnapshot> =>
        ipcRenderer.invoke(IPC_CHANNELS.BANDWIDTH_GET),

    onBandwidthUpdate: (callback: (snapshot: BandwidthSnapshot) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, snapshot: BandwidthSnapshot): void => {
            callback(snapshot)
        }
        ipcRenderer.on(IPC_CHANNELS.BANDWIDTH_UPDATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.BANDWIDTH_UPDATE, handler)
        }
    },

    testWebhook: (url: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.WEBHOOK_TEST, url),

    checkForUpdates: (): Promise<UpdateStatus> =>
        ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),

    downloadUpdate: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),

    installUpdate: (): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),

    onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => {
            callback(status)
        }
        ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler)
        }
    },

    getRemoteState: (): Promise<RemoteServerState> =>
        ipcRenderer.invoke(IPC_CHANNELS.REMOTE_GET_STATE),

    setRemoteServerEnabled: (enabled: boolean, token?: string): Promise<RemoteServerState> =>
        ipcRenderer.invoke(IPC_CHANNELS.REMOTE_SET_ENABLED, { enabled, token }),

    getRemoteSnapshot: (): Promise<RemoteSnapshot> =>
        ipcRenderer.invoke(IPC_CHANNELS.REMOTE_SNAPSHOT),

    onRemoteAgents: (callback: (agents: RemoteAgentInfo[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, agents: RemoteAgentInfo[]): void => {
            callback(agents)
        }
        ipcRenderer.on(IPC_CHANNELS.REMOTE_AGENTS, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.REMOTE_AGENTS, handler)
        }
    },

    onRemoteEvents: (callback: (item: RemoteEventItem) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, item: RemoteEventItem): void => {
            callback(item)
        }
        ipcRenderer.on(IPC_CHANNELS.REMOTE_EVENTS, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.REMOTE_EVENTS, handler)
        }
    },

    onRemoteServerState: (callback: (state: RemoteServerState) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, state: RemoteServerState): void => {
            callback(state)
        }
        ipcRenderer.on(IPC_CHANNELS.REMOTE_SERVER_STATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.REMOTE_SERVER_STATE, handler)
        }
    },

    getPagerDutyState: (): Promise<PagerDutyState> =>
        ipcRenderer.invoke(IPC_CHANNELS.PAGERDUTY_GET_STATE),

    setPagerDuty: (input: { enabled: boolean; routingKey?: string; severityFloor?: string }): Promise<PagerDutyState> =>
        ipcRenderer.invoke(IPC_CHANNELS.PAGERDUTY_SET, input),

    testPagerDuty: (routingKey: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.PAGERDUTY_TEST, routingKey),

    login: (username: string, password: string): Promise<SessionInfo | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, username, password),

    logout: (token: string): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT, token),

    getSession: (token: string): Promise<SessionInfo | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.AUTH_SESSION, token),

    listUsers: (sessionToken: string): Promise<AppUser[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.USERS_LIST, sessionToken),

    createUser: (sessionToken: string, input: { username: string; password: string; role: Role }): Promise<AppUser[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.USERS_CREATE, sessionToken, input),

    setUserDisabled: (sessionToken: string, id: string, disabled: boolean): Promise<AppUser[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.USERS_SET_DISABLED, sessionToken, id, disabled),

    deleteUser: (sessionToken: string, id: string): Promise<AppUser[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.USERS_DELETE, sessionToken, id),

    onUsersChanged: (callback: (users: AppUser[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, users: AppUser[]): void => {
            callback(users)
        }
        ipcRenderer.on(IPC_CHANNELS.USERS_CHANGED, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.USERS_CHANGED, handler)
        }
    },

    getRestApiState: (): Promise<RestApiState> =>
        ipcRenderer.invoke(IPC_CHANNELS.REST_GET_STATE),

    setRestApi: (sessionToken: string, input: { enabled: boolean; port?: number; token?: string }): Promise<RestApiState> =>
        ipcRenderer.invoke(IPC_CHANNELS.REST_SET, sessionToken, input),

    onRestApiState: (callback: (state: RestApiState) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, state: RestApiState): void => {
            callback(state)
        }
        ipcRenderer.on(IPC_CHANNELS.REST_STATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.REST_STATE, handler)
        }
    },

    getSiemState: (): Promise<SiemState> =>
        ipcRenderer.invoke(IPC_CHANNELS.SIEM_GET_STATE),

    setSiem: (sessionToken: string, input: { enabled: boolean; vendor?: SiemVendor; endpoint?: string; token?: string; severityFloor?: string }): Promise<SiemState> =>
        ipcRenderer.invoke(IPC_CHANNELS.SIEM_SET, sessionToken, input),

    testSiem: (sessionToken: string, input: { vendor: SiemVendor; endpoint: string; token: string }): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.SIEM_TEST, sessionToken, input),

    onSiemState: (callback: (state: SiemState) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, state: SiemState): void => {
            callback(state)
        }
        ipcRenderer.on(IPC_CHANNELS.SIEM_STATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.SIEM_STATE, handler)
        }
    },

    generateCompliance: (sessionToken: string, framework: ComplianceFramework): Promise<ComplianceReport> =>
        ipcRenderer.invoke(IPC_CHANNELS.COMPLIANCE_GENERATE, sessionToken, framework),

    exportCompliancePdf: (sessionToken: string, framework: ComplianceFramework): Promise<string> =>
        ipcRenderer.invoke(IPC_CHANNELS.COMPLIANCE_EXPORT_PDF, sessionToken, framework),

    getCompliance: (): Promise<ComplianceReport | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.COMPLIANCE_GET),

    onComplianceReady: (callback: (report: ComplianceReport) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, report: ComplianceReport): void => {
            callback(report)
        }
        ipcRenderer.on(IPC_CHANNELS.COMPLIANCE_READY, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.COMPLIANCE_READY, handler)
        }
    },

    getInsiderState: (): Promise<InsiderThreatState> =>
        ipcRenderer.invoke(IPC_CHANNELS.INSIDER_GET_STATE),

    onInsiderEvent: (callback: (event: InsiderThreatEvent) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, event: InsiderThreatEvent): void => {
            callback(event)
        }
        ipcRenderer.on(IPC_CHANNELS.INSIDER_EVENT, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.INSIDER_EVENT, handler)
        }
    },

    getCommunityState: (): Promise<CommunityState> =>
        ipcRenderer.invoke(IPC_CHANNELS.COMMUNITY_GET_STATE),

    setCommunityEnabled: (enabled: boolean, sessionToken?: string): Promise<CommunityState> =>
        ipcRenderer.invoke(IPC_CHANNELS.COMMUNITY_SET_ENABLED, enabled, sessionToken),

    setCommunityConfig: (cfg: { endpoint: string; key: string; severityFloor: ThreatLevel }, sessionToken?: string): Promise<CommunityState> =>
        ipcRenderer.invoke(IPC_CHANNELS.COMMUNITY_SET_CONFIG, cfg, sessionToken),

    testCommunity: (endpoint: string, key: string, sessionToken?: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.COMMUNITY_TEST, endpoint, key, sessionToken),

    previewCommunityPayload: (): Promise<ThreatIntelSubmission[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.COMMUNITY_PREVIEW),

    onCommunityState: (callback: (state: CommunityState) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, state: CommunityState): void => {
            callback(state)
        }
        ipcRenderer.on(IPC_CHANNELS.COMMUNITY_STATE, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.COMMUNITY_STATE, handler)
        }
    },

    activateLicense: (licenseKey: string): Promise<{ success: boolean; status: LicenseStatus; error?: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.LICENSE_ACTIVATE, licenseKey),

    getLicenseStatus: (): Promise<LicenseStatus> =>
        ipcRenderer.invoke(IPC_CHANNELS.LICENSE_STATUS),

    onLicenseChanged: (callback: (status: LicenseStatus) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, status: LicenseStatus): void => {
            callback(status)
        }
        ipcRenderer.on(IPC_CHANNELS.LICENSE_CHANGED, handler)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.LICENSE_CHANGED, handler)
        }
    },
}

contextBridge.exposeInMainWorld('fortis', fortisAPI)

import type { NetworkConnection, ConnectionStats, TimeSeriesPoint } from './connection';
import type { Alert, AlertFilters, AlertCounts } from './alert';
import type { AIAnalysisResult, AIUsageStats } from './analysis';
import type { UserSettings, SubscriptionTier, LicenseStatus } from './settings';
import type { WhitelistEntry } from './whitelist';
import type { WifiDevice, DnsQueryRecord, VpnLeakStatus, GeoConnection, IotDevice } from './m1';
import type { WeeklyReport, ReportExportFormat, AiPayloadView, FlowGraph, OllamaModelsResult } from './m2';
import type { DefenseAction, BlockedIp, CustomRule, TlsCertInfo, BandwidthSnapshot } from './m3';
import type { UpdateStatus } from './m4';
import type { RemoteAgentInfo, RemoteEventItem, RemoteServerState, RemoteSnapshot, PagerDutyState } from './m5';
import type { AppUser, SessionInfo, RestApiState, SiemState, SiemVendor, ComplianceFramework, ComplianceReport, InsiderThreatState, InsiderThreatEvent, Role } from './m6';
import type { CommunityState, ThreatIntelSubmission } from './m7';
import type { ThreatLevel } from './analysis';

export const TIER_LABELS: Record<SubscriptionTier, string> = {
    free: 'Free',
    pro: 'Pro',
    enterprise: 'Enterprise',
};

export function isFreeTier(tier: SubscriptionTier): boolean {
    return tier === 'free';
}

/** A rejected write resolves with this envelope instead of throwing. */
export interface IpcWriteError {
    success: false;
    error: { code: string; message: string };
}

/** Handlers return void on success, or an error envelope on rejection. */
export type IpcWriteResult = void | IpcWriteError;

export function isIpcWriteError(result: unknown): result is IpcWriteError {
    return typeof result === 'object' && result !== null && (result as { success?: unknown }).success === false;
}

export const IPC_CHANNELS = {
    CONNECTIONS_GET: 'connections:get',
    CONNECTIONS_UPDATE: 'connections:update',
    SCAN_TRIGGER: 'scan:trigger',
    SCAN_STATUS_UPDATE: 'scan:status-update',
    MONITOR_PAUSE: 'monitor:pause',
    MONITOR_RESUME: 'monitor:resume',
    MONITOR_STATUS: 'monitor:status',
    SETTINGS_GET: 'settings:get',
    SETTINGS_UPDATE: 'settings:update',
    SETTINGS_CHANGED: 'settings:changed',
    STATS_CONNECTION_TIMELINE: 'stats:connection-timeline',
    STATS_CONNECTION_STATS: 'stats:connection-stats',
    APP_VERSION: 'app:version',
    APP_PLATFORM: 'app:platform',
    ALERT_NEW: 'alert:new',
    ALERTS_GET: 'alerts:get',
    NAVIGATE_TO: 'navigate:to',

    AI_ANALYZE: 'ai:analyze',
    AI_STATUS: 'ai:status',
    AI_USAGE: 'ai:usage',
    ALERTS_RECENT: 'alerts:recent',
    ALERTS_ACKNOWLEDGE: 'alerts:acknowledge',
    ALERTS_COUNTS: 'alerts:counts',
    WHITELIST_GET: 'whitelist:get',
    WHITELIST_ADD: 'whitelist:add',
    WHITELIST_REMOVE: 'whitelist:remove',
    WHITELIST_EXPORT: 'whitelist:export',
    WHITELIST_IMPORT: 'whitelist:import',
    WHITELIST_UPDATED: 'whitelist:updated',
    TIER_INFO: 'tier:info',
    AI_ANALYSIS_UPDATE: 'ai:analysis-update',
    AI_LAST_ANALYSIS: 'ai:last-analysis',
    LEARNING_STATUS: 'learning:status',
    AI_SET_KEY: 'ai:set-key',
    AI_VALIDATE_KEY: 'ai:validate-key',

    DEVICES_GET: 'devices:get',
    DEVICES_UPDATE: 'devices:update',
    DEVICES_RENAME: 'devices:rename',
    DNS_GET: 'dns:get',
    DNS_UPDATE: 'dns:update',
    VPN_STATUS_GET: 'vpn:status',
    VPN_STATUS_UPDATE: 'vpn:update',
    GEO_GET: 'geo:get',
    GEO_UPDATE: 'geo:update',
    IOT_GET: 'iot:get',
    IOT_UPDATE: 'iot:update',

    REPORTS_GET: 'reports:get',
    REPORT_GENERATE: 'reports:generate',
    REPORT_EXPORT: 'reports:export',
    REPORTS_UPDATE: 'reports:update',
    AI_PAYLOAD_GET: 'ai:payload',
    FLOW_GET: 'flow:get',
    FLOW_UPDATE: 'flow:update',
    OLLAMA_MODELS: 'ollama:models',

    DEFENSE_ACTIONS_GET: 'defense:actions-get',
    DEFENSE_ACTIONS_UPDATE: 'defense:actions-update',
    DEFENSE_KILL_CONFIRM: 'defense:kill-confirm',
    DEFENSE_BLOCK_CONFIRM: 'defense:block-confirm',
    DEFENSE_ACTION_CANCEL: 'defense:action-cancel',
    BLOCKED_IPS_GET: 'defense:blocked-get',
    BLOCKED_IP_UNBLOCK: 'defense:unblock',
    RULES_GET: 'rules:get',
    RULES_SAVE: 'rules:save',
    RULES_DELETE: 'rules:delete',
    CERTS_GET: 'certs:get',
    CERTS_UPDATE: 'certs:update',
    BANDWIDTH_GET: 'bandwidth:get',
    BANDWIDTH_UPDATE: 'bandwidth:update',
    WEBHOOK_TEST: 'webhook:test',

    UPDATE_CHECK: 'update:check',
    UPDATE_DOWNLOAD: 'update:download',
    UPDATE_INSTALL: 'update:install',
    UPDATE_STATUS: 'update:status',

    REMOTE_GET_STATE: 'remote:get-state',
    REMOTE_SET_ENABLED: 'remote:set-enabled',
    REMOTE_SNAPSHOT: 'remote:snapshot',
    REMOTE_AGENTS: 'remote:agents',
    REMOTE_EVENTS: 'remote:events',
    REMOTE_SERVER_STATE: 'remote:server-state',
    PAGERDUTY_GET_STATE: 'pagerduty:get-state',
    PAGERDUTY_SET: 'pagerduty:set',
    PAGERDUTY_TEST: 'pagerduty:test',

    AUTH_LOGIN: 'auth:login',
    AUTH_LOGOUT: 'auth:logout',
    AUTH_SESSION: 'auth:session',
    USERS_LIST: 'users:list',
    USERS_CREATE: 'users:create',
    USERS_SET_DISABLED: 'users:set-disabled',
    USERS_DELETE: 'users:delete',
    USERS_CHANGED: 'users:changed',
    REST_GET_STATE: 'rest:get-state',
    REST_SET: 'rest:set',
    REST_STATE: 'rest:state',
    SIEM_GET_STATE: 'siem:get-state',
    SIEM_SET: 'siem:set',
    SIEM_TEST: 'siem:test',
    SIEM_STATE: 'siem:state',
    COMPLIANCE_GENERATE: 'compliance:generate',
    COMPLIANCE_EXPORT_PDF: 'compliance:export-pdf',
    COMPLIANCE_GET: 'compliance:get',
    COMPLIANCE_READY: 'compliance:ready',
    INSIDER_GET_STATE: 'insider:get-state',
    INSIDER_EVENT: 'insider:event',
    COMMUNITY_GET_STATE: 'community:get-state',
    COMMUNITY_SET_ENABLED: 'community:set-enabled',
    COMMUNITY_SET_CONFIG: 'community:set-config',
    COMMUNITY_TEST: 'community:test',
    COMMUNITY_PREVIEW: 'community:preview',
    COMMUNITY_STATE: 'community:state',

    LICENSE_ACTIVATE: 'license:activate',
    LICENSE_STATUS: 'license:status',
    LICENSE_CHANGED: 'license:changed',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

export type MonitorStatus = {
    isRunning: boolean;
    isPaused: boolean;
    scanInterval: number;
    lastScanTimestamp: number | null;
    connectionCount: number;
};

export interface ScanStatusPayload {
    scanning: boolean;
    error?: string;
}

export interface AIStatusInfo {
    provider: string | null;
    isAvailable: boolean;
    circuitState: string;
    lastAnalysisTimestamp: number | null;
}

export interface TierInfo {
    tier: SubscriptionTier;
    remainingScans: number;
    totalAllowedScans: number;
    isLearningPeriod: boolean;
    learningDaysRemaining: number;
    isAutoTriggersEnabled: boolean;
    isNotificationsEnabled: boolean;
}

export interface LearningStatusPayload {
    isLearningPeriod: boolean;
    daysRemaining: number;
    complete: boolean;
    baselineCount: number;
}

export interface KeyValidationResult {
    valid: boolean;
    provider: string;
    error?: string;
}

export interface FortisAPI {
    getConnections: () => Promise<NetworkConnection[]>;
    triggerScan: () => Promise<void>;
    pauseMonitoring: () => Promise<void>;
    resumeMonitoring: () => Promise<void>;
    getMonitoringStatus: () => Promise<MonitorStatus>;
    getSettings: () => Promise<UserSettings>;
    updateSettings: (settings: Partial<UserSettings>, sessionToken?: string) => Promise<IpcWriteResult>;
    onConnectionsUpdate: (callback: (connections: NetworkConnection[]) => void) => () => void;
    onSettingsChanged: (callback: (settings: UserSettings) => void) => () => void;
    onNavigateTo: (callback: (view: string) => void) => () => void;
    onScanStatus: (callback: (status: ScanStatusPayload) => void) => () => void;
    getConnectionTimeline: (from: number, to: number) => Promise<TimeSeriesPoint[]>;
    getConnectionStats: () => Promise<ConnectionStats>;
    getAlerts: (filtersOrLimit?: AlertFilters | number) => Promise<Alert[]>;
    onNewAlert: (callback: (alert: Alert) => void) => () => void;
    getAppVersion: () => Promise<string>;
    getPlatform: () => Promise<NodeJS.Platform>;

    triggerAIAnalysis: () => Promise<AIAnalysisResult | null>;
    getAIStatus: () => Promise<AIStatusInfo>;
    getAIUsage: () => Promise<AIUsageStats>;
    getLastAnalysis: () => Promise<AIAnalysisResult | null>;
    getRecentAlerts: (limit?: number) => Promise<Alert[]>;
    acknowledgeAlert: (id: string) => Promise<boolean>;
    getAlertCounts: () => Promise<AlertCounts>;
    getWhitelist: () => Promise<WhitelistEntry[]>;
    addToWhitelist: (entry: Omit<WhitelistEntry, 'id' | 'createdAt'>) => Promise<string>;
    removeFromWhitelist: (id: string) => Promise<boolean>;
    exportWhitelist: () => Promise<WhitelistEntry[]>;
    importWhitelist: (entries: WhitelistEntry[]) => Promise<{ imported: number; skipped: number }>;
    onWhitelistUpdate: (callback: (entries: WhitelistEntry[]) => void) => () => void;
    getTierInfo: () => Promise<TierInfo>;
    onAnalysisUpdate: (callback: (result: AIAnalysisResult) => void) => () => void;
    onLearningStatus: (callback: (status: LearningStatusPayload) => void) => () => void;
    setApiKey: (provider: string, key: string) => Promise<{ success: boolean; error?: string }>;
    validateApiKey: (provider: string, key: string) => Promise<KeyValidationResult>;

    getDevices: () => Promise<WifiDevice[]>;
    onDevicesUpdate: (callback: (devices: WifiDevice[]) => void) => () => void;
    renameDevice: (mac: string, customName: string | null) => Promise<WifiDevice[]>;
    getDnsQueries: () => Promise<DnsQueryRecord[]>;
    onDnsUpdate: (callback: (records: DnsQueryRecord[]) => void) => () => void;
    getVpnStatus: () => Promise<VpnLeakStatus>;
    onVpnUpdate: (callback: (status: VpnLeakStatus) => void) => () => void;
    getGeoConnections: () => Promise<GeoConnection[]>;
    onGeoUpdate: (callback: (connections: GeoConnection[]) => void) => () => void;
    getIotDevices: () => Promise<IotDevice[]>;
    onIotUpdate: (callback: (devices: IotDevice[]) => void) => () => void;

    getReports: () => Promise<WeeklyReport[]>;
    generateReport: (periodDays?: number) => Promise<WeeklyReport>;
    exportReport: (id: string, format: ReportExportFormat) => Promise<string>;
    onReportsUpdate: (callback: (reports: WeeklyReport[]) => void) => () => void;
    getAiPayload: () => Promise<AiPayloadView>;
    getFlowGraph: () => Promise<FlowGraph>;
    onFlowUpdate: (callback: (graph: FlowGraph) => void) => () => void;
    discoverOllamaModels: (endpoint?: string) => Promise<OllamaModelsResult>;

    getDefenseActions(): Promise<DefenseAction[]>;
    onDefenseActionsUpdate(callback: (actions: DefenseAction[]) => void): () => void;
    confirmKill(actionId: string): Promise<DefenseAction[]>;
    confirmBlock(actionId: string): Promise<DefenseAction[]>;
    cancelDefenseAction(actionId: string): Promise<DefenseAction[]>;
    getBlockedIps(): Promise<BlockedIp[]>;
    unblockIp(ip: string): Promise<BlockedIp[]>;
    getRules(): Promise<CustomRule[]>;
    saveRule(rule: CustomRule): Promise<CustomRule[]>;
    deleteRule(id: string): Promise<CustomRule[]>;
    getCerts(): Promise<TlsCertInfo[]>;
    onCertsUpdate(callback: (certs: TlsCertInfo[]) => void): () => void;
    getBandwidth(): Promise<BandwidthSnapshot>;
    onBandwidthUpdate(callback: (snapshot: BandwidthSnapshot) => void): () => void;
    testWebhook(url: string): Promise<boolean>;

    checkForUpdates(): Promise<UpdateStatus>;
    downloadUpdate(): Promise<void>;
    installUpdate(): Promise<void>;
    onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;

    getRemoteState(): Promise<RemoteServerState>;
    getRemoteSnapshot(): Promise<RemoteSnapshot>;
    setRemoteServerEnabled(enabled: boolean, token?: string): Promise<RemoteServerState>;
    onRemoteAgents(callback: (agents: RemoteAgentInfo[]) => void): () => void;
    onRemoteEvents(callback: (item: RemoteEventItem) => void): () => void;
    onRemoteServerState(callback: (state: RemoteServerState) => void): () => void;
    getPagerDutyState(): Promise<PagerDutyState>;
    setPagerDuty(input: { enabled: boolean; routingKey?: string; severityFloor?: string }): Promise<PagerDutyState>;
    testPagerDuty(routingKey: string): Promise<boolean>;

    login(username: string, password: string): Promise<SessionInfo | null>;
    logout(token: string): Promise<void>;
    getSession(token: string): Promise<SessionInfo | null>;
    listUsers(sessionToken: string): Promise<AppUser[]>;
    createUser(sessionToken: string, input: { username: string; password: string; role: Role }): Promise<AppUser[]>;
    setUserDisabled(sessionToken: string, id: string, disabled: boolean): Promise<AppUser[]>;
    deleteUser(sessionToken: string, id: string): Promise<AppUser[]>;
    onUsersChanged(callback: (users: AppUser[]) => void): () => void;

    getRestApiState(): Promise<RestApiState>;
    setRestApi(sessionToken: string, input: { enabled: boolean; port?: number; token?: string }): Promise<RestApiState>;
    onRestApiState(callback: (state: RestApiState) => void): () => void;

    getSiemState(): Promise<SiemState>;
    setSiem(sessionToken: string, input: { enabled: boolean; vendor?: SiemVendor; endpoint?: string; token?: string; severityFloor?: string }): Promise<SiemState>;
    testSiem(sessionToken: string, input: { vendor: SiemVendor; endpoint: string; token: string }): Promise<boolean>;
    onSiemState(callback: (state: SiemState) => void): () => void;

    generateCompliance(sessionToken: string, framework: ComplianceFramework): Promise<ComplianceReport>;
    exportCompliancePdf(sessionToken: string, framework: ComplianceFramework): Promise<string>;
    getCompliance(): Promise<ComplianceReport | null>;
    onComplianceReady(callback: (report: ComplianceReport) => void): () => void;

    getInsiderState(): Promise<InsiderThreatState>;
    onInsiderEvent(callback: (event: InsiderThreatEvent) => void): () => void;

    getCommunityState(): Promise<CommunityState>;
    setCommunityEnabled(enabled: boolean, sessionToken?: string): Promise<CommunityState>;
    setCommunityConfig(cfg: { endpoint: string; key: string; severityFloor: ThreatLevel }, sessionToken?: string): Promise<CommunityState>;
    testCommunity(endpoint: string, key: string, sessionToken?: string): Promise<boolean>;
    previewCommunityPayload(): Promise<ThreatIntelSubmission[]>;
    onCommunityState(callback: (state: CommunityState) => void): () => void;

    activateLicense(licenseKey: string): Promise<{ success: boolean; status: LicenseStatus; error?: string }>;
    getLicenseStatus(): Promise<LicenseStatus>;
    onLicenseChanged(callback: (status: LicenseStatus) => void): () => void;
}

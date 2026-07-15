import type { AIProviderType, ThreatLevel } from './analysis';
import type { SiemVendor } from './m6';
import type { SupportedLocale } from './m7';

export type AIProvider = 'none' | AIProviderType | 'local';

export type Theme = 'dark' | 'light' | 'system';

export type SensitivityLevel = 'paranoid' | 'balanced' | 'relaxed';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface LicenseStatus {
    tier: SubscriptionTier
    valid: boolean
    reason: string
    expiresAt: number | null
    machineLocked: boolean
    customerId: string | null
    seatCount: number | null
}

export interface UserSettings {
    aiProvider: AIProvider;
    openaiApiKey: string;
    anthropicApiKey: string;
    scanInterval: number;
    adaptiveInterval: boolean;
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    autoStart: boolean;
    onboardingCompleted: boolean;
    theme: Theme;
    sensitivityLevel: SensitivityLevel;
    tier: SubscriptionTier;
    licenseKey: string;
    dailyAiScansUsed: number;
    lastScanDate: string;
    learningPeriodStart: string;
    learningPeriodComplete: boolean;
    binaryHash: string;
    anonymizerSalt: string;
    ollamaEndpoint: string;
    ollamaModel: string;
    defenseEnabled: boolean;
    webhookUrl: string;
    webhookEnabled: boolean;
    remoteServerEnabled: boolean;
    remoteServerHost: string;
    remoteServerPort: number;
    remoteAuthToken: string;
    remoteServerTlsEnabled: boolean;
    remoteServerCertPath: string;
    remoteServerKeyPath: string;
    pagerDutyEnabled: boolean;
    pagerDutyRoutingKey: string;
    pagerDutySeverityFloor: ThreatLevel;
    pagerDutyVerified: boolean;
    rbacEnabled: boolean;
    restApiEnabled: boolean;
    restApiPort: number;
    restApiToken: string;
    siemEnabled: boolean;
    siemVendor: SiemVendor;
    siemEndpoint: string;
    siemToken: string;
    siemSeverityFloor: ThreatLevel;
    siemVerified: boolean;
    insiderThreatEnabled: boolean;
    complianceOrgName: string;
    complianceAccentColor: string;
    openaiCompatibleEndpoint: string;
    language: SupportedLocale;
    threatIntelEnabled: boolean;
    threatIntelEndpoint: string;
    threatIntelKey: string;
    threatIntelVerified: boolean;
    threatIntelSeverityFloor: ThreatLevel;
    windowBounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export const SENSITIVE_SETTING_KEYS = [
    'openaiApiKey',
    'anthropicApiKey',
    'licenseKey',
    'remoteAuthToken',
    'pagerDutyRoutingKey',
    'restApiToken',
    'siemToken',
    'threatIntelKey',
] as const

export type SensitiveSettingKey = (typeof SENSITIVE_SETTING_KEYS)[number]

export const SENSITIVE_SETTING_KEYS_SET: ReadonlySet<SensitiveSettingKey> = new Set(SENSITIVE_SETTING_KEYS)

export const BLOCKED_API_KEY_FIELDS = SENSITIVE_SETTING_KEYS.filter((key) => key !== 'licenseKey')

export function isSensitiveSettingKey(key: string): key is SensitiveSettingKey {
    return SENSITIVE_SETTING_KEYS_SET.has(key as SensitiveSettingKey)
}

export const DEFAULT_SETTINGS: UserSettings = {
    aiProvider: 'none',
    openaiApiKey: '',
    anthropicApiKey: '',
    scanInterval: 5000,
    adaptiveInterval: true,
    notificationsEnabled: true,
    soundEnabled: false,
    autoStart: false,
    onboardingCompleted: false,
    theme: 'dark',
    sensitivityLevel: 'balanced',
    tier: 'free',
    licenseKey: '',
    dailyAiScansUsed: 0,
    lastScanDate: '',
    learningPeriodStart: '',
    learningPeriodComplete: false,
    binaryHash: '',
    anonymizerSalt: '',
    ollamaEndpoint: 'http://127.0.0.1:11434',
    ollamaModel: '',
    defenseEnabled: false,
    webhookUrl: '',
    webhookEnabled: false,
    remoteServerEnabled: false,
    remoteServerHost: '127.0.0.1',
    remoteServerPort: 47600,
    remoteAuthToken: '',
    remoteServerTlsEnabled: false,
    remoteServerCertPath: '',
    remoteServerKeyPath: '',
    pagerDutyEnabled: false,
    pagerDutyRoutingKey: '',
    pagerDutySeverityFloor: 'critical',
    pagerDutyVerified: false,
    rbacEnabled: false,
    restApiEnabled: false,
    restApiPort: 47700,
    restApiToken: '',
    siemEnabled: false,
    siemVendor: 'splunk',
    siemEndpoint: '',
    siemToken: '',
    siemSeverityFloor: 'warning',
    siemVerified: false,
    insiderThreatEnabled: false,
    complianceOrgName: '',
    complianceAccentColor: '#3b82f6',
    openaiCompatibleEndpoint: '',
    language: 'en',
    threatIntelEnabled: false,
    threatIntelEndpoint: '',
    threatIntelKey: '',
    threatIntelVerified: false,
    threatIntelSeverityFloor: 'warning',
};

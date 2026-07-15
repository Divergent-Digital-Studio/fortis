import { describe, it, expect, beforeEach, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const registeredHandlers = new Map<string, Handler>()

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, handler: Handler): void => {
            registeredHandlers.set(channel, handler)
        },
    },
    app: { getVersion: (): string => '0.0.0-test' },
    BrowserWindow: { getAllWindows: (): unknown[] => [] },
}))

vi.mock('@main/services/auto-start', () => ({
    handleAutoStartSettingChange: () => {},
}))

vi.mock('@main/services/encryption', () => ({
    encryptApiKey: (key: string): string => key,
    isApiKeyFormat: (): boolean => true,
    sanitizeSettingsForIpc: (settings: Record<string, unknown>): Record<string, unknown> => settings,
}))

import { registerAllHandlers, injectServices, resetIpcRegistrationState } from '@main/ipc-handlers'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import type { DatabaseService } from '@main/services/database'

const stored = new Map<string, unknown>()

function fakeDb(): DatabaseService {
    return {
        getAllSettings: (): typeof DEFAULT_SETTINGS => ({ ...DEFAULT_SETTINGS }),
        setSetting: (key: string, value: unknown): void => {
            stored.set(key, value)
        },
        setEncryptedSetting: (): void => {},
    } as unknown as DatabaseService
}

function isValidationError(result: unknown): boolean {
    return (
        typeof result === 'object' &&
        result !== null &&
        (result as { error?: { code?: string } }).error?.code === 'VALIDATION_ERROR'
    )
}

beforeEach(() => {
    registeredHandlers.clear()
    stored.clear()
    injectServices({})
    resetIpcRegistrationState()
    registerAllHandlers()
    injectServices({ database: fakeDb() })
})

describe('INT-04 SETTINGS_UPDATE validator accepts persisted settings keys', () => {
    it('accepts a string binaryHash', async () => {
        const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!
        const result = await handler({}, { binaryHash: 'abc123' })
        expect(isValidationError(result)).toBe(false)
        expect(stored.get('binaryHash')).toBe('abc123')
    })

    it('rejects a numeric binaryHash', async () => {
        const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!
        const result = await handler({}, { binaryHash: 42 })
        expect(isValidationError(result)).toBe(true)
    })

    it('accepts a mixed partial {soundEnabled, binaryHash}', async () => {
        const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!
        const result = await handler({}, { soundEnabled: true, binaryHash: 'deadbeef' })
        expect(isValidationError(result)).toBe(false)
    })

    it('accepts a string anonymizerSalt', async () => {
        const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!
        const result = await handler({}, { anonymizerSalt: 'salt' })
        expect(isValidationError(result)).toBe(false)
    })

    it('accepts valid remote bind hosts', async () => {
        const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!
        for (const host of ['127.0.0.1', '0.0.0.0', '192.168.0.172', 'localhost']) {
            const result = await handler({}, { remoteServerHost: host })
            expect(isValidationError(result), host).toBe(false)
            expect(stored.get('remoteServerHost')).toBe(host)
        }
    })

    it('rejects a malformed remote bind host', async () => {
        const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!
        for (const host of ['999.1.1.1', '1.2.3', 'has space', '10.0.0.1:47600', '']) {
            const result = await handler({}, { remoteServerHost: host })
            expect(isValidationError(result), host).toBe(true)
        }
    })

    it('no persisted settings key is silently dropped by the validator (drift guard)', async () => {
        const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!
        const apiKeyFields = new Set(['openaiApiKey', 'anthropicApiKey', 'remoteAuthToken', 'pagerDutyRoutingKey', 'restApiToken', 'siemToken', 'threatIntelKey'])
        const routedToDedicatedChannel = new Set(['tier'])

        const valueFor: Record<string, unknown> = {
            aiProvider: 'none',
            scanInterval: 5000,
            adaptiveInterval: true,
            notificationsEnabled: true,
            soundEnabled: false,
            autoStart: false,
            onboardingCompleted: false,
            theme: 'dark',
            sensitivityLevel: 'balanced',
            tier: 'free',
            licenseKey: 'k',
            dailyAiScansUsed: 0,
            lastScanDate: '2020-01-01',
            learningPeriodStart: '2020-01-01',
            learningPeriodComplete: false,
            binaryHash: 'h',
            anonymizerSalt: 's',
            ollamaEndpoint: 'http://127.0.0.1:11434',
            ollamaModel: 'llama3',
            windowBounds: { x: 0, y: 0, width: 1, height: 1 },
            defenseEnabled: true,
            webhookUrl: 'https://hooks.example.com/abc',
            webhookEnabled: true,
            remoteServerEnabled: false,
            remoteServerHost: '127.0.0.1',
            remoteServerPort: 47600,
            remoteServerTlsEnabled: false,
            remoteServerCertPath: '',
            remoteServerKeyPath: '',
            pagerDutyEnabled: false,
            pagerDutySeverityFloor: 'critical',
            pagerDutyVerified: false,
            rbacEnabled: false,
            restApiEnabled: false,
            restApiPort: 47700,
            siemEnabled: false,
            siemVendor: 'splunk',
            siemEndpoint: 'https://splunk.example.com:8088',
            siemSeverityFloor: 'warning',
            siemVerified: false,
            insiderThreatEnabled: false,
            complianceOrgName: 'Acme',
            complianceAccentColor: '#3b82f6',
            openaiCompatibleEndpoint: 'http://127.0.0.1:8000/v1',
            openaiApiKey: 'sk-x',
            anthropicApiKey: 'sk-x',
            language: 'en',
            threatIntelEnabled: false,
            threatIntelEndpoint: 'https://intel.example.com/submit',
            threatIntelVerified: false,
            threatIntelSeverityFloor: 'warning',
        }

        for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>) {
            if (apiKeyFields.has(key)) continue
            if (routedToDedicatedChannel.has(key)) {
                const result = await handler({}, { [key]: valueFor[key] })
                expect(isValidationError(result), `tier should be routed to license:activate, not settings:update`).toBe(true)
                continue
            }
            expect(key in valueFor, `missing test value for ${key}`).toBe(true)
            const result = await handler({}, { [key]: valueFor[key] })
            expect(isValidationError(result), `validator rejected single-key partial for ${key}`).toBe(false)
        }
    })
})

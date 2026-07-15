import { describe, it, expect, beforeEach, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const registeredHandlers = new Map<string, Handler>()
const sentMessages: Array<{ channel: string; payload: unknown }> = []

const fakeWebContents = {
    send: (channel: string, payload: unknown): void => {
        sentMessages.push({ channel, payload })
    },
}

const fakeWindow = {
    isDestroyed: (): boolean => false,
    webContents: fakeWebContents,
}

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, handler: Handler): void => {
            if (registeredHandlers.has(channel)) {
                throw new Error(`Attempted to register a second handler for '${channel}'`)
            }
            registeredHandlers.set(channel, handler)
        },
    },
    app: {
        getVersion: (): string => '0.0.0-test',
    },
    BrowserWindow: {
        getAllWindows: (): unknown[] => [fakeWindow],
    },
}))

vi.mock('@main/services/auto-start', () => ({
    handleAutoStartSettingChange: () => {},
}))

vi.mock('@main/services/encryption', () => ({
    encrypt: (plain: string): string => plain,
    encryptApiKey: (key: string): string => key,
    isApiKeyFormat: (): boolean => true,
    sanitizeSettingsForIpc: (settings: Record<string, unknown>): Record<string, unknown> => settings,
}))

vi.mock('@main/tray', () => ({
    updateTrayState: () => {},
    updateConnectionCount: () => {},
}))

import {
    registerAllHandlers,
    injectServices,
    pushAnalysisUpdate,
    wireRendererBridges,
    handleScanError,
    resetIpcRegistrationState,
} from '@main/ipc-handlers'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { FortisEventBus } from '@main/services/event-bus'
import { EventPipeline } from '@main/services/event-pipeline'
import { SensitivityTuner } from '@main/services/sensitivity-tuner'
import type { DatabaseService } from '@main/services/database'
import type { AIAnalysisResult } from '@shared/types/analysis'
import type { NetworkMonitor } from '@main/services/network-monitor'

function fakeDb(): DatabaseService {
    return {
        saveScanMetadata: () => 'm',
        saveSnapshot: () => 's',
        saveAlert: () => 'a',
        compact: () => {},
        saveBatchDiffs: () => [],
    } as unknown as DatabaseService
}

function sampleAnalysis(): AIAnalysisResult {
    return {
        id: 'an1',
        timestamp: Date.now(),
        provider: 'openai',
        model: 'gpt',
        overallThreatLevel: 'safe',
        healthScore: 100,
        summary: 's',
        findings: [],
        newConnections: 0,
        droppedConnections: 0,
        tokensUsed: 0,
        costEstimate: 0,
        latencyMs: 0,
        cached: false,
    }
}

beforeEach(() => {
    registeredHandlers.clear()
    sentMessages.length = 0
    injectServices({})
    resetIpcRegistrationState()
})

describe('INT-01 AI_ANALYSIS_UPDATE is emitted by main', () => {
    it('bridges analysis:complete to AI_ANALYSIS_UPDATE exactly once with the result', () => {
        const eventBus = new FortisEventBus()
        wireRendererBridges(eventBus)

        const result = sampleAnalysis()
        eventBus.emit('analysis:complete', { result })

        const updates = sentMessages.filter((m) => m.channel === IPC_CHANNELS.AI_ANALYSIS_UPDATE)
        expect(updates).toHaveLength(1)
        expect(updates[0]?.payload).toBe(result)
    })

    it('pushAnalysisUpdate is a live export with at least one caller', () => {
        expect(typeof pushAnalysisUpdate).toBe('function')
    })
})

describe('INT-02 SCAN_STATUS_UPDATE has a single unified shape', () => {
    it('handleScanError sends one unified {scanning,error} payload', () => {
        handleScanError({ message: 'boom' })

        const updates = sentMessages.filter((m) => m.channel === IPC_CHANNELS.SCAN_STATUS_UPDATE)
        expect(updates).toHaveLength(1)
        expect(updates[0]?.payload).toEqual({ scanning: false, error: 'boom' })
    })
})

describe('INT idempotent registration and bridge wiring', () => {
    it('registerAllHandlers is safe to call twice (no duplicate ipcMain.handle throw)', () => {
        registerAllHandlers()
        const countAfterFirst = registeredHandlers.size
        expect(() => registerAllHandlers()).not.toThrow()
        expect(registeredHandlers.size).toBe(countAfterFirst)
    })

    it('wireRendererBridges called twice does not double-emit to the renderer', () => {
        const eventBus = new FortisEventBus()
        const first = wireRendererBridges(eventBus)
        const second = wireRendererBridges(eventBus)
        expect(second).toBe(first)

        eventBus.emit('analysis:complete', { result: sampleAnalysis() })

        const updates = sentMessages.filter((m) => m.channel === IPC_CHANNELS.AI_ANALYSIS_UPDATE)
        expect(updates).toHaveLength(1)
    })

    it('the unsubscribe returned by wireRendererBridges removes the bus listeners', () => {
        const eventBus = new FortisEventBus()
        const unsubscribe = wireRendererBridges(eventBus)
        unsubscribe()

        eventBus.emit('analysis:complete', { result: sampleAnalysis() })

        const updates = sentMessages.filter((m) => m.channel === IPC_CHANNELS.AI_ANALYSIS_UPDATE)
        expect(updates).toHaveLength(0)
    })
})

describe('INT-03 void handlers reject on failure', () => {
    function failingMonitor(): NetworkMonitor {
        return {
            triggerManualScan: async (): Promise<void> => {
                throw new Error('scan failed')
            },
            pause: (): void => {
                throw new Error('pause failed')
            },
            resume: (): void => {
                throw new Error('resume failed')
            },
            getStatus: (): string => 'running',
            getLastScanTimestamp: (): number | null => null,
        } as unknown as NetworkMonitor
    }

    it('SCAN_TRIGGER rejects when triggerManualScan throws', async () => {
        registerAllHandlers()
        injectServices({ monitor: failingMonitor() })

        const handler = registeredHandlers.get(IPC_CHANNELS.SCAN_TRIGGER)
        expect(handler).toBeTypeOf('function')
        await expect(handler!({})).rejects.toThrow('scan failed')
    })

    it('MONITOR_PAUSE rejects when pause throws', async () => {
        registerAllHandlers()
        injectServices({ monitor: failingMonitor() })

        const handler = registeredHandlers.get(IPC_CHANNELS.MONITOR_PAUSE)
        await expect(handler!({})).rejects.toThrow('pause failed')
    })

    it('MONITOR_RESUME rejects when resume throws', async () => {
        registerAllHandlers()
        injectServices({ monitor: failingMonitor() })

        const handler = registeredHandlers.get(IPC_CHANNELS.MONITOR_RESUME)
        await expect(handler!({})).rejects.toThrow('resume failed')
    })
})

describe('IPC contract: license activation + tier gating', () => {
    function isValidationError(result: unknown): boolean {
        return (
            typeof result === 'object' &&
            result !== null &&
            (result as { error?: { code?: string } }).error?.code === 'VALIDATION_ERROR'
        )
    }

    it('LICENSE_STATUS returns free tier when no tierGating injected', async () => {
        registerAllHandlers()
        const handler = registeredHandlers.get(IPC_CHANNELS.LICENSE_STATUS)!
        const status = await handler({})
        expect(status.tier).toBe('free')
        expect(status.valid).toBe(false)
    })

    it('LICENSE_ACTIVATE rejects a non-string key', async () => {
        registerAllHandlers()
        const handler = registeredHandlers.get(IPC_CHANNELS.LICENSE_ACTIVATE)!
        const result = await handler({}, 12345)
        expect(result.success).toBe(false)
        expect(result.error).toContain('string')
    })

    it('LICENSE_ACTIVATE stores + verifies via tierGating', async () => {
        const storedSettings = new Map<string, unknown>()
        const fakeDb = {
            getSetting: (k: string) => storedSettings.get(k),
            setEncryptedSetting: (k: string, v: unknown) => { storedSettings.set(k, v) },
            setSetting: (k: string, v: unknown) => { storedSettings.set(k, v) },
        }
        const fakeTierGating = {
            getVerifiedTier: () => ({ tier: 'pro', valid: true, reason: 'valid', expiresAt: 9999999999999, machineLocked: false, customerId: 'cust_1', seatCount: null }),
        }
        injectServices({ database: fakeDb as never, tierGating: fakeTierGating as never })
        registerAllHandlers()

        const handler = registeredHandlers.get(IPC_CHANNELS.LICENSE_ACTIVATE)!
        const result = await handler({}, 'FORTIS-LICENSE-V1-test.sig')
        expect(result.success).toBe(true)
        expect(result.status.tier).toBe('pro')
        expect(result.status.valid).toBe(true)

        const licenseChangedMsg = sentMessages.find((m) => m.channel === IPC_CHANNELS.LICENSE_CHANGED)
        expect(licenseChangedMsg).toBeDefined()
        expect((licenseChangedMsg!.payload as { tier: string }).tier).toBe('pro')
    })

    it('LICENSE_ACTIVATE surfaces an invalid license gracefully', async () => {
        const fakeDb = {
            getSetting: () => '',
            setEncryptedSetting: () => {},
            setSetting: () => {},
        }
        const fakeTierGating = {
            getVerifiedTier: () => ({ tier: 'free', valid: false, reason: 'bad-signature', expiresAt: null, machineLocked: false, customerId: null, seatCount: null }),
        }
        injectServices({ database: fakeDb as never, tierGating: fakeTierGating as never })
        registerAllHandlers()

        const handler = registeredHandlers.get(IPC_CHANNELS.LICENSE_ACTIVATE)!
        const result = await handler({}, 'forged-key')
        expect(result.success).toBe(false)
        expect(result.status.tier).toBe('free')
        expect(result.error).toContain('signature')
    })

    // main/index.ts calls registerAllHandlers() BEFORE injectServices({ tierGating }),
    // so the boot-time sync inside registerLicenseHandlers() sees a null tierGating.
    // Without a re-sync on injection a cached `settings.tier` outlives its license.
    it('re-derives a stale cached tier when tierGating is injected after registration', async () => {
        const storedSettings = new Map<string, unknown>([['tier', 'pro'], ['licenseKey', 'forged']])
        const fakeDb = {
            getSetting: (k: string) => storedSettings.get(k),
            setSetting: (k: string, v: unknown) => { storedSettings.set(k, v) },
            setEncryptedSetting: (k: string, v: unknown) => { storedSettings.set(k, v) },
            getAllSettings: () => Object.fromEntries(storedSettings),
        }
        const expiredLicense = {
            getVerifiedTier: () => ({ tier: 'free', valid: false, reason: 'expired', expiresAt: null, machineLocked: false, customerId: null, seatCount: null }),
        }

        injectServices({ database: fakeDb as never })
        registerAllHandlers()
        expect(storedSettings.get('tier')).toBe('pro')

        injectServices({ tierGating: expiredLicense as never })
        expect(storedSettings.get('tier')).toBe('free')

        const pushed = sentMessages.filter((m) => m.channel === IPC_CHANNELS.SETTINGS_CHANGED)
        expect((pushed.at(-1)!.payload as { tier: string }).tier).toBe('free')
    })

    it('leaves an already-correct cached tier untouched', async () => {
        const storedSettings = new Map<string, unknown>([['tier', 'pro']])
        const fakeDb = {
            getSetting: (k: string) => storedSettings.get(k),
            setSetting: (k: string, v: unknown) => { storedSettings.set(k, v) },
            setEncryptedSetting: () => {},
            getAllSettings: () => Object.fromEntries(storedSettings),
        }
        const validLicense = {
            getVerifiedTier: () => ({ tier: 'pro', valid: true, reason: 'valid', expiresAt: 9999999999999, machineLocked: false, customerId: null, seatCount: null }),
        }
        injectServices({ database: fakeDb as never })
        registerAllHandlers()
        sentMessages.length = 0

        injectServices({ tierGating: validLicense as never })
        expect(storedSettings.get('tier')).toBe('pro')
        expect(sentMessages.filter((m) => m.channel === IPC_CHANNELS.SETTINGS_CHANGED)).toHaveLength(0)
    })

    it('tier cannot be set via SETTINGS_UPDATE (must use license:activate)', async () => {
        const fakeDb = {
            getSetting: () => '',
            setSetting: () => {},
        }
        injectServices({ database: fakeDb as never })
        registerAllHandlers()
        const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!
        const result = await handler({}, { tier: 'enterprise' })
        expect(isValidationError(result)).toBe(true)
    })
})

describe('IPC contract: every renderer-bound channel is emitted by main', () => {
    it('AI_ANALYSIS_UPDATE and SCAN_STATUS_UPDATE are produced by main wiring', () => {
        const eventBus = new FortisEventBus()
        wireRendererBridges(eventBus)

        const pipeline = new EventPipeline({
            eventBus,
            monitor: {} as never,
            scheduler: { setBaseInterval: () => {}, setAdaptiveEnabled: () => {} } as never,
            database: fakeDb(),
            sensitivityTuner: new SensitivityTuner(),
        })
        pipeline.wire()

        eventBus.emit('analysis:complete', { result: sampleAnalysis() })
        eventBus.emit('scan:error', { error: new Error('x'), platform: 'test' })

        const channels = new Set(sentMessages.map((m) => m.channel))
        expect(channels.has(IPC_CHANNELS.AI_ANALYSIS_UPDATE)).toBe(true)
        expect(channels.has(IPC_CHANNELS.SCAN_STATUS_UPDATE)).toBe(true)

        const errorUpdates = sentMessages.filter(
            (m) => m.channel === IPC_CHANNELS.SCAN_STATUS_UPDATE &&
                (m.payload as { error?: string }).error === 'x',
        )
        expect(errorUpdates).toHaveLength(1)
        expect(errorUpdates[0]?.payload).toEqual({ scanning: false, error: 'x' })

        pipeline.dispose()
    })
})

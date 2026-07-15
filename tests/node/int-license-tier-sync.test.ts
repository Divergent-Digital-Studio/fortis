import { describe, it, expect, vi, beforeEach } from 'vitest'

const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
            registeredHandlers.set(channel, handler)
        },
        removeAllListeners: () => {},
    },
    app: { getVersion: () => '1.0.0' },
    BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('@main/services/auto-start', () => ({ handleAutoStartSettingChange: () => {} }))
vi.mock('@main/services/encryption', () => ({
    encrypt: (p: string): string => p,
    encryptApiKey: (k: string): string => k,
    isApiKeyFormat: (): boolean => true,
    sanitizeSettingsForIpc: (s: Record<string, unknown>): Record<string, unknown> => s,
}))
vi.mock('@main/tray', () => ({ updateTrayState: () => {}, updateConnectionCount: () => {} }))

import { registerAllHandlers, injectServices, resetIpcRegistrationState } from '@main/ipc-handlers'
import { FortisEventBus } from '@main/services/event-bus'

function fakeDatabase(initial: Record<string, unknown>) {
    const store = { ...initial }
    return {
        store,
        getSetting: (k: string) => store[k],
        setSetting: (k: string, v: unknown) => {
            store[k] = v
        },
        setEncryptedSetting: (k: string, v: unknown) => {
            store[k] = v
        },
        getAllSettings: () => ({ ...store }),
    }
}

function fakeTierGating(tier: 'free' | 'pro' | 'enterprise') {
    return {
        getVerifiedTier: () => ({ tier, valid: tier !== 'free', reason: 'valid', expiresAt: null, machineId: null, customerId: null, seatCount: null }),
        getRemainingScans: () => 0,
        getTierLimits: () => ({}),
    }
}

beforeEach(() => {
    registeredHandlers.clear()
    resetIpcRegistrationState()
})

describe('settings.tier mirrors the verified license', () => {
    it('activating an enterprise license writes settings.tier', async () => {
        const database = fakeDatabase({ tier: 'free' })
        injectServices({
            database: database as never,
            tierGating: fakeTierGating('enterprise') as never,
            eventBus: new FortisEventBus() as never,
        })
        registerAllHandlers()

        const activate = registeredHandlers.get('license:activate')!
        const result = (await activate({}, 'FORTIS-LICENSE-V1-whatever')) as { success: boolean }

        expect(result.success).toBe(true)
        expect(database.store.tier).toBe('enterprise')
    })

    it('boot re-derives settings.tier when a stored license no longer verifies', () => {
        const database = fakeDatabase({ tier: 'enterprise', licenseKey: 'expired-key' })
        injectServices({
            database: database as never,
            tierGating: fakeTierGating('free') as never,
            eventBus: new FortisEventBus() as never,
        })
        registerAllHandlers()

        expect(database.store.tier).toBe('free')
    })
})

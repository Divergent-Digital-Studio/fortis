import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FortisEventMap } from '@main/services/event-bus'

const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>()
const sentMessages: Array<{ channel: string; payload: unknown }> = []

vi.mock('electron', () => {
    return {
        ipcMain: {
            handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
                if (registeredHandlers.has(channel)) {
                    throw new Error(`duplicate registration for ${channel}`)
                }
                registeredHandlers.set(channel, handler)
            },
            removeAllListeners: () => {},
        },
        app: { getVersion: () => '1.0.0' },
        BrowserWindow: {
            getAllWindows: () => [],
        },
    }
})

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

interface FakeSession {
    token: string
    role: 'admin' | 'manager' | 'observer'
}

function fakeSessionService(active: boolean, sessions: FakeSession[] = []) {
    return {
        isRbacActive: () => active,
        resolve: (token: string) => {
            const s = sessions.find((x) => x.token === token)
            if (!s) return null
            return { user: { id: 'u1', username: 'u', role: s.role, disabled: false }, role: s.role }
        },
        login: (_u: string, _p: string) => {
            const s = sessions[0]
            if (!s) return null
            return { token: s.token, user: { id: 'u1', username: 'u', role: s.role }, role: s.role, expiresAt: Date.now() + 60000 }
        },
        logout: () => {},
        listUsers: () => [],
        createUser: () => [],
        setUserDisabled: () => [],
        deleteUser: () => [],
        resolveSession: () => null,
    }
}

beforeEach(() => {
    registeredHandlers.clear()
    sentMessages.length = 0
    resetIpcRegistrationState()
})

describe('RBAC enforcement on read/export channels (RBAC ON)', () => {
    it('blocks an unauthenticated read of connections:get', async () => {
        injectServices({ sessionService: fakeSessionService(true, []) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const handler = registeredHandlers.get('connections:get')!
        await expect(handler({})).rejects.toThrow('FORBIDDEN')
    })

    it('allows an observer (view scope) to read connections:get after login', async () => {
        const sessions = [{ token: 'obs-token', role: 'observer' as const }]
        injectServices({ sessionService: fakeSessionService(true, sessions) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const loginHandler = registeredHandlers.get('auth:login')!
        await loginHandler({}, 'u', 'p')

        const handler = registeredHandlers.get('connections:get')!
        const result = await handler({})
        expect(Array.isArray(result)).toBe(true)
    })

    it('blocks an observer from exporting the whitelist (export-reports scope)', async () => {
        const sessions = [{ token: 'obs-token', role: 'observer' as const }]
        injectServices({ sessionService: fakeSessionService(true, sessions) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const loginHandler = registeredHandlers.get('auth:login')!
        await loginHandler({}, 'u', 'p')

        const handler = registeredHandlers.get('whitelist:export')!
        await expect(handler({})).rejects.toThrow('FORBIDDEN')
    })

    it('blocks an observer from deleting a user (manage-users scope)', async () => {
        const sessions = [{ token: 'obs-token', role: 'observer' as const }]
        injectServices({ sessionService: fakeSessionService(true, sessions) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const loginHandler = registeredHandlers.get('auth:login')!
        await loginHandler({}, 'u', 'p')

        const handler = registeredHandlers.get('users:delete')!
        expect(() => handler({}, undefined, 'victim')).toThrow('FORBIDDEN')
    })

    it('blocks an unauthenticated user delete', async () => {
        injectServices({ sessionService: fakeSessionService(true, []) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const handler = registeredHandlers.get('users:delete')!
        expect(() => handler({}, undefined, 'victim')).toThrow('FORBIDDEN')
    })

    it('blocks an observer from unblocking an IP (manage-defense scope)', async () => {
        const sessions = [{ token: 'obs-token', role: 'observer' as const }]
        injectServices({ sessionService: fakeSessionService(true, sessions) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const loginHandler = registeredHandlers.get('auth:login')!
        await loginHandler({}, 'u', 'p')

        const handler = registeredHandlers.get('defense:unblock')!
        await expect(handler({}, '1.2.3.4')).rejects.toThrow('FORBIDDEN')
    })

    it('public channels (app:version, license:status) are reachable without a session', async () => {
        injectServices({ sessionService: fakeSessionService(true, []) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const versionHandler = registeredHandlers.get('app:version')!
        const result = await versionHandler({})
        expect(result).toBe('1.0.0')
    })

    it('login sets the active session token used by read handlers', async () => {
        const sessions = [{ token: 'admin-token', role: 'admin' as const }]
        const svc = fakeSessionService(true, sessions)
        injectServices({ sessionService: svc as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const loginHandler = registeredHandlers.get('auth:login')!
        const loginResult = await loginHandler({}, 'u', 'p') as { token: string } | null
        expect(loginResult).not.toBeNull()
        expect(loginResult!.token).toBe('admin-token')
    })
})

describe('RBAC enforcement when RBAC is OFF (default single-user)', () => {
    it('read channels are open without a session (no behavior change)', async () => {
        injectServices({ sessionService: fakeSessionService(false, []) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const handler = registeredHandlers.get('connections:get')!
        const result = await handler({})
        expect(Array.isArray(result)).toBe(true)
    })

    it('export channels are open without a session when RBAC off', async () => {
        injectServices({ sessionService: fakeSessionService(false, []) as never, eventBus: new FortisEventBus() as never })
        registerAllHandlers()

        const handler = registeredHandlers.get('whitelist:export')!
        const result = await handler({})
        expect(Array.isArray(result)).toBe(true)
    })
})

describe('RBAC-governed settings writes use the logged-in session (RBAC ON)', () => {
    function fakeDb(store: Map<string, unknown>) {
        return {
            getAllSettings: () => ({}),
            setSetting: (k: string, v: unknown) => { store.set(k, v) },
            setEncryptedSetting: () => {},
        }
    }

    it('an admin can change the remote bind host without threading a token', async () => {
        const store = new Map<string, unknown>()
        const sessions = [{ token: 'admin-token', role: 'admin' as const }]
        injectServices({
            sessionService: fakeSessionService(true, sessions) as never,
            eventBus: new FortisEventBus() as never,
            database: fakeDb(store) as never,
        })
        registerAllHandlers()

        await registeredHandlers.get('auth:login')!({}, 'u', 'p')

        // No sessionToken argument — the UI does not thread one.
        const result = await registeredHandlers.get('settings:update')!({}, { remoteServerHost: '0.0.0.0' })
        expect((result as { success?: boolean } | undefined)?.success).not.toBe(false)
        expect(store.get('remoteServerHost')).toBe('0.0.0.0')
    })

    it('an observer still cannot change the remote bind host', async () => {
        const store = new Map<string, unknown>()
        const sessions = [{ token: 'obs-token', role: 'observer' as const }]
        injectServices({
            sessionService: fakeSessionService(true, sessions) as never,
            eventBus: new FortisEventBus() as never,
            database: fakeDb(store) as never,
        })
        registerAllHandlers()

        await registeredHandlers.get('auth:login')!({}, 'u', 'p')

        const result = await registeredHandlers.get('settings:update')!({}, { remoteServerHost: '0.0.0.0' })
        expect((result as { success: boolean }).success).toBe(false)
        expect(store.has('remoteServerHost')).toBe(false)
    })

    it('an unauthenticated write is still rejected', async () => {
        const store = new Map<string, unknown>()
        injectServices({
            sessionService: fakeSessionService(true, []) as never,
            eventBus: new FortisEventBus() as never,
            database: fakeDb(store) as never,
        })
        registerAllHandlers()

        const result = await registeredHandlers.get('settings:update')!({}, { remoteServerHost: '0.0.0.0' })
        expect((result as { success: boolean }).success).toBe(false)
        expect(store.has('remoteServerHost')).toBe(false)
    })
})

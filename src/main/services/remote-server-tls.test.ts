import { describe, it, expect } from 'vitest'
import { connect } from 'node:net'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RemoteServer } from './remote-server'
import type { FortisEventBus } from './event-bus'

function makeBus(): FortisEventBus {
    return {
        emit: () => {},
        on: () => () => {},
        off: () => {},
    } as unknown as FortisEventBus
}

/** Returns cert+key paths, or null when openssl is unavailable. */
function makeSelfSignedCert(): { dir: string; certPath: string; keyPath: string } | null {
    let dir: string
    try {
        dir = mkdtempSync(join(tmpdir(), 'fortis-tls-'))
    } catch {
        return null
    }
    const certPath = join(dir, 'cert.pem')
    const keyPath = join(dir, 'key.pem')
    try {
        execFileSync(
            'openssl',
            ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost'],
            { stdio: 'ignore' },
        )
    } catch {
        rmSync(dir, { recursive: true, force: true })
        return null
    }
    return { dir, certPath, keyPath }
}

function portAccepts(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = connect({ host, port })
        const done = (result: boolean): void => {
            socket.destroy()
            resolve(result)
        }
        socket.once('connect', () => done(true))
        socket.once('error', () => done(false))
        socket.setTimeout(1000, () => done(false))
    })
}

describe('RemoteServer TLS config handling', () => {
    it('starts a plain ws server when tlsEnabled is false', () => {
        let factoryCalled = false
        const server = new RemoteServer({
            eventBus: makeBus(),
            getToken: () => 'a-valid-token',
            getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 48000, tlsEnabled: false }),
            serverFactory: () => {
                factoryCalled = true
                return {
                    onConnection: () => {},
                    onError: () => {},
                    close: () => {},
                }
            },
        })
        server.start()
        expect(factoryCalled).toBe(true)
        server.stop()
    })

    it('prefers the factory even when tlsEnabled is true (tests inject TLS via factory)', () => {
        let factoryCalled = false
        const server = new RemoteServer({
            eventBus: makeBus(),
            getToken: () => 'a-valid-token',
            getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 48001, tlsEnabled: true, certPath: '/nonexistent.cert', keyPath: '/nonexistent.key' }),
            serverFactory: () => {
                factoryCalled = true
                return {
                    onConnection: () => {},
                    onError: () => {},
                    close: () => {},
                }
            },
        })
        server.start()
        expect(factoryCalled).toBe(true)
        server.stop()
    })

    it('refuses to start without an auth token even with TLS configured', () => {
        const stateEmissions: unknown[] = []
        const server = new RemoteServer({
            eventBus: { emit: (_e: string, p: unknown) => { if (_e === 'remote:server-state') stateEmissions.push(p) }, on: () => () => {}, off: () => {} } as unknown as FortisEventBus,
            getToken: () => '',
            getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 48002, tlsEnabled: true, certPath: '/x.cert', keyPath: '/x.key' }),
        })
        server.start()
        expect(stateEmissions.length).toBeGreaterThan(0)
        const last = stateEmissions[stateEmissions.length - 1] as { listening: boolean; error?: string }
        expect(last.listening).toBe(false)
        expect(last.error).toContain('auth token')
    })

    // Regression: the TLS branch built an https server but never called listen(),
    // so no socket was ever bound. Uses the real createServer (no serverFactory).
    it('binds the port when TLS is enabled', async () => {
        const certs = makeSelfSignedCert()
        if (!certs) return // openssl unavailable
        const port = 48123
        const server = new RemoteServer({
            eventBus: makeBus(),
            getToken: () => 'a-valid-token',
            getConfig: () => ({
                enabled: true,
                host: '127.0.0.1',
                port,
                tlsEnabled: true,
                certPath: certs.certPath,
                keyPath: certs.keyPath,
            }),
        })
        try {
            server.start()
            await new Promise((r) => setTimeout(r, 100))
            expect(await portAccepts('127.0.0.1', port)).toBe(true)
        } finally {
            server.stop()
            rmSync(certs.dir, { recursive: true, force: true })
        }
    })

    it('refuses to start plaintext ws on a non-loopback host', () => {
        const stateEmissions: Array<{ listening: boolean; error?: string }> = []
        let factoryCalled = false
        const server = new RemoteServer({
            eventBus: {
                emit: (e: string, p: unknown) => {
                    if (e === 'remote:server-state') stateEmissions.push(p as { listening: boolean; error?: string })
                },
                on: () => () => {},
                off: () => {},
            } as unknown as FortisEventBus,
            getToken: () => 'a-valid-token',
            getConfig: () => ({ enabled: true, host: '0.0.0.0', port: 48005, tlsEnabled: false }),
            serverFactory: () => {
                factoryCalled = true
                return { onConnection: () => {}, onError: () => {}, close: () => {} }
            },
        })
        server.start()
        expect(factoryCalled).toBe(false)
        const last = stateEmissions[stateEmissions.length - 1]
        expect(last?.listening).toBe(false)
        expect(last?.error).toContain('TLS is disabled')
        server.stop()
    })

    it('allows a non-loopback host when TLS is enabled', () => {
        let factoryCalled = false
        const server = new RemoteServer({
            eventBus: makeBus(),
            getToken: () => 'a-valid-token',
            getConfig: () => ({ enabled: true, host: '0.0.0.0', port: 48006, tlsEnabled: true, certPath: '/x.cert', keyPath: '/x.key' }),
            serverFactory: () => {
                factoryCalled = true
                return { onConnection: () => {}, onError: () => {}, close: () => {} }
            },
        })
        server.start()
        expect(factoryCalled).toBe(true)
        server.stop()
    })

    it('refuses to start (rather than serving plaintext) when TLS is on but cert/key are unset', () => {
        const stateEmissions: Array<{ listening: boolean; error?: string }> = []
        const server = new RemoteServer({
            eventBus: {
                emit: (e: string, p: unknown) => {
                    if (e === 'remote:server-state') stateEmissions.push(p as { listening: boolean; error?: string })
                },
                on: () => () => {},
                off: () => {},
            } as unknown as FortisEventBus,
            getToken: () => 'a-valid-token',
            getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 48004, tlsEnabled: true }),
        })
        server.start()
        const last = stateEmissions[stateEmissions.length - 1]
        expect(last?.listening).toBe(false)
        expect(last?.error).toContain('TLS is enabled')
        server.stop()
    })

    // getAgents() backs the remote:snapshot IPC handler, which hydrates the UI on mount.
    it('reports authenticated agents through getAgents()', () => {
        const token = 'a-valid-token'
        let onMessage: ((data: unknown) => void) | undefined
        const socket = {
            on: (event: string, cb: (data: unknown) => void) => {
                if (event === 'message') onMessage = cb
            },
            send: () => {},
            close: () => {},
        }
        let emitConnection: ((s: typeof socket) => void) | undefined
        const server = new RemoteServer({
            eventBus: makeBus(),
            getToken: () => token,
            getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 48003 }),
            serverFactory: () => ({
                onConnection: (cb) => {
                    emitConnection = cb as (s: typeof socket) => void
                },
                onError: () => {},
                close: () => {},
            }),
        })
        server.start()
        expect(server.getAgents()).toEqual([])

        emitConnection!(socket)
        onMessage!(
            JSON.stringify({ v: 1, type: 'hello', ts: Date.now(), agentId: 'agent-1', platform: 'linux', token }),
        )
        expect(server.getAgents().map((a) => a.agentId)).toEqual(['agent-1'])
        expect(server.getAgents().map((a) => a.status)).toEqual(['connected'])

        server.stop()
    })
})

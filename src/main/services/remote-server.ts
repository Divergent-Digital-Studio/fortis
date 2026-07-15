import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { WebSocketServer, type WebSocket } from 'ws';
import type { FortisEventBus } from './event-bus';
import {
    decodeFrame,
    encodeFrame,
    isHelloFrame,
    isConnectionsFrame,
    isAlertFrame,
    FRAME_VERSION,
} from '../../shared/remote/frame';
import type { RemoteAgentInfo, RemoteEventItem, RemoteServerState } from '../../shared/types/m5';
import { isPubliclyBound } from '../../shared/utils/bind-host';

const HANDSHAKE_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 25000;
const STALE_AFTER_MS = 60000;
const MAX_EVENT_BUFFER = 200;
const SERVER_VERSION = '1.0.0';

export interface WsConnLike {
    on(event: 'message', cb: (data: unknown) => void): void;
    on(event: 'close', cb: () => void): void;
    on(event: 'error', cb: (err: Error) => void): void;
    send(data: string): void;
    close(code?: number): void;
}

export interface WebSocketServerLike {
    onConnection(cb: (socket: WsConnLike) => void): void;
    onError(cb: (err: Error) => void): void;
    close(): void;
}

interface RemoteServerConfig {
    enabled: boolean;
    host: string;
    port: number;
    tlsEnabled?: boolean;
    certPath?: string;
    keyPath?: string;
}

interface RemoteServerDeps {
    eventBus: FortisEventBus;
    getToken: () => string;
    getConfig: () => RemoteServerConfig;
    serverFactory?: (host: string, port: number) => WebSocketServerLike;
}

function constantTimeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

interface AgentConn {
    info: RemoteAgentInfo;
    socket: WsConnLike;
}

export class RemoteServer {
    private wss: WebSocketServerLike | null = null;
    private readonly agents = new Map<WsConnLike, AgentConn>();
    private readonly recentEvents: RemoteEventItem[] = [];
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private listening = false;
    private lastError: string | undefined;

    constructor(private readonly deps: RemoteServerDeps) {}

    start(): void {
        const cfg = this.deps.getConfig();
        if (!cfg.enabled || this.wss) {
            this.emitState();
            return;
        }
        if (this.deps.getToken().length === 0) {
            this.lastError = 'Remote server not started: set an auth token first';
            console.error('[RemoteServer] refusing to start without an auth token');
            this.emitState();
            return;
        }
        if (cfg.tlsEnabled !== true && isPubliclyBound(cfg.host)) {
            this.lastError = `Remote server not started: host ${cfg.host} is reachable from the network but TLS is disabled. Enable TLS or bind to 127.0.0.1.`;
            console.error('[RemoteServer] refusing to start plaintext ws on a non-loopback host', {
                host: cfg.host,
                port: cfg.port,
            });
            this.emitState();
            return;
        }
        try {
            this.wss = this.createServer(cfg.host, cfg.port);
        } catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            this.emitState();
            return;
        }
        this.wss.onError((err) => {
            this.lastError = err.message;
            this.listening = false;
            this.emitState();
        });
        this.wss.onConnection((socket) => this.handleConnection(socket));
        this.listening = true;
        this.lastError = undefined;
        this.pingTimer = setInterval(() => this.pingAndReap(), PING_INTERVAL_MS);
        this.emitState();
    }

    stop(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        for (const conn of this.agents.keys()) {
            try {
                conn.close();
            } catch {
                /* already closed */
            }
        }
        this.agents.clear();
        if (this.wss) {
            try {
                this.wss.close();
            } catch {
                /* already closed */
            }
            this.wss = null;
        }
        this.listening = false;
        this.emitState();
        this.emitAgents();
    }

    restart(): void {
        this.stop();
        this.start();
    }

    getState(): RemoteServerState {
        const cfg = this.deps.getConfig();
        const base: RemoteServerState = {
            enabled: cfg.enabled,
            listening: this.listening,
            host: cfg.host,
            port: cfg.port,
            agentCount: this.agents.size,
        };
        return this.lastError ? { ...base, error: this.lastError } : base;
    }

    getRecentEvents(): RemoteEventItem[] {
        return [...this.recentEvents];
    }

    getAgents(): RemoteAgentInfo[] {
        return [...this.agents.values()].map((c) => ({ ...c.info }));
    }

    private createServer(host: string, port: number): WebSocketServerLike {
        if (this.deps.serverFactory) return this.deps.serverFactory(host, port);
        const cfg = this.deps.getConfig();
        const useTls = cfg.tlsEnabled === true;
        if (useTls && (!cfg.certPath || !cfg.keyPath)) {
            // Never silently downgrade an operator's TLS request to plaintext.
            throw new Error('TLS is enabled but no certificate/key path is configured');
        }
        let httpsServer: HttpsServer | null = null;
        let wss: WebSocketServer;
        if (useTls) {
            httpsServer = createHttpsServer({
                cert: readFileSync(cfg.certPath!),
                key: readFileSync(cfg.keyPath!),
            });
            wss = new WebSocketServer({ server: httpsServer });
            httpsServer.listen(port, host);
        } else {
            wss = new WebSocketServer({ host, port });
        }
        return {
            onConnection: (cb) => {
                wss.on('connection', (socket: WebSocket) => cb(adaptSocket(socket)));
            },
            onError: (cb) => {
                wss.on('error', cb);
                httpsServer?.on('error', cb);
            },
            close: () => {
                wss.close();
                if (httpsServer) {
                    try {
                        httpsServer.close();
                    } catch {
                        /* noop */
                    }
                }
            },
        };
    }

    private handleConnection(socket: WsConnLike): void {
        let settled = false;
        const timeout = setTimeout(() => {
            if (!settled) {
                try {
                    socket.close(4408);
                } catch {
                    /* noop */
                }
            }
        }, HANDSHAKE_TIMEOUT_MS);

        socket.on('message', (data) => {
            const raw = typeof data === 'string' ? data : String(data);
            const frame = decodeFrame(raw);
            const existing = this.agents.get(socket);
            if (!existing) {
                if (!isHelloFrame(frame)) return;
                const expected = this.deps.getToken();
                if (expected.length === 0 || !constantTimeEqual(frame.token, expected)) {
                    try {
                        socket.close(4401);
                    } catch {
                        /* noop */
                    }
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                const now = Date.now();
                const info: RemoteAgentInfo = {
                    agentId: frame.agentId,
                    platform: frame.platform,
                    status: 'connected',
                    connectedAt: now,
                    lastSeen: now,
                };
                this.agents.set(socket, { info, socket });
                socket.send(encodeFrame({ v: FRAME_VERSION, type: 'welcome', ts: now, serverVersion: SERVER_VERSION }));
                this.emitAgents();
                this.emitState();
                return;
            }
            existing.info.lastSeen = Date.now();
            existing.info.status = 'connected';
            if (isConnectionsFrame(frame)) {
                this.pushEvent({
                    agentId: existing.info.agentId,
                    kind: 'connections',
                    ts: frame.ts,
                    summary: `${frame.connections.length} connections`,
                    count: frame.connections.length,
                });
            } else if (isAlertFrame(frame)) {
                this.pushEvent({
                    agentId: existing.info.agentId,
                    kind: 'alert',
                    ts: frame.ts,
                    summary: frame.alert.title,
                    threatLevel: frame.alert.threatLevel,
                });
            }
        });

        socket.on('close', () => {
            clearTimeout(timeout);
            this.agents.delete(socket);
            this.emitAgents();
            this.emitState();
        });
        socket.on('error', () => {
            /* connection-level error; close handler cleans up */
        });
    }

    private pushEvent(item: RemoteEventItem): void {
        this.recentEvents.unshift(item);
        if (this.recentEvents.length > MAX_EVENT_BUFFER) this.recentEvents.length = MAX_EVENT_BUFFER;
        this.deps.eventBus.emit('remote:event', { item });
    }

    private pingAndReap(): void {
        const now = Date.now();
        let changed = false;
        for (const conn of this.agents.values()) {
            if (now - conn.info.lastSeen > STALE_AFTER_MS && conn.info.status !== 'stale') {
                conn.info.status = 'stale';
                changed = true;
            }
            try {
                conn.socket.send(encodeFrame({ v: FRAME_VERSION, type: 'ping', ts: now }));
            } catch {
                /* will be reaped on close */
            }
        }
        if (changed) this.emitAgents();
    }

    private emitAgents(): void {
        this.deps.eventBus.emit('remote:agents', { agents: this.getAgents() });
    }

    private emitState(): void {
        this.deps.eventBus.emit('remote:server-state', this.getState());
    }
}

function adaptSocket(socket: WebSocket): WsConnLike {
    const on = (event: string, cb: (arg?: unknown) => void): void => {
        if (event === 'message') {
            socket.on('message', (data: unknown) => cb(data));
        } else if (event === 'close') {
            socket.on('close', () => cb());
        } else {
            socket.on('error', (err: Error) => cb(err));
        }
    };
    return {
        on: on as WsConnLike['on'],
        send: (data: string): void => socket.send(data),
        close: (code?: number): void => socket.close(code),
    };
}

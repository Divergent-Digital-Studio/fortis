import { BackoffController } from '../shared/remote/backoff';
import { encodeFrame, decodeFrame, type RemoteFrame, FRAME_VERSION } from '../shared/remote/frame';
import type { NetworkConnection } from '../shared/types/connection';
import type { Alert } from '../shared/types/alert';

export interface WsLike {
    send(data: string): void;
    close(): void;
    on(event: 'open' | 'message' | 'close' | 'error', cb: (arg?: unknown) => void): void;
}

export type WsFactory = (url: string) => WsLike;

interface AgentLinkDeps {
    serverUrl: string;
    token: string;
    agentId: string;
    platform: string;
    wsFactory: WsFactory;
    backoff?: BackoffController;
    log?: (msg: string) => void;
}

export class AgentLink {
    private ws: WsLike | null = null;
    private connected = false;
    private readonly backoff: BackoffController;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    private readonly log: (msg: string) => void;

    constructor(private readonly deps: AgentLinkDeps) {
        this.backoff = deps.backoff ?? new BackoffController();
        this.log = deps.log ?? ((m) => console.log(`[Agent] ${m}`));
    }

    start(): void {
        this.stopped = false;
        this.connect();
    }

    stop(): void {
        this.stopped = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.connected = false;
        try {
            this.ws?.close();
        } catch {
            /* socket already gone */
        }
        this.ws = null;
    }

    isConnected(): boolean {
        return this.connected;
    }

    sendConnections(connections: NetworkConnection[]): void {
        this.sendFrame({ v: FRAME_VERSION, type: 'connections', ts: Date.now(), connections });
    }

    sendAlert(alert: Alert): void {
        this.sendFrame({ v: FRAME_VERSION, type: 'alert', ts: Date.now(), alert });
    }

    private sendFrame(frame: RemoteFrame): void {
        if (!this.connected || !this.ws) return;
        try {
            this.ws.send(encodeFrame(frame));
        } catch (err) {
            this.log(`send failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private connect(): void {
        if (this.stopped) return;
        this.log(`connecting to ${this.deps.serverUrl}`);
        let socket: WsLike;
        try {
            socket = this.deps.wsFactory(this.deps.serverUrl);
        } catch (err) {
            this.log(`connect threw: ${err instanceof Error ? err.message : String(err)}`);
            this.scheduleReconnect();
            return;
        }
        this.ws = socket;
        socket.on('open', () => {
            socket.send(
                encodeFrame({
                    v: FRAME_VERSION,
                    type: 'hello',
                    ts: Date.now(),
                    agentId: this.deps.agentId,
                    platform: this.deps.platform,
                    token: this.deps.token,
                }),
            );
        });
        socket.on('message', (data) => {
            const frame = decodeFrame(typeof data === 'string' ? data : String(data));
            if (!frame) return;
            if (frame.type === 'welcome') {
                this.connected = true;
                this.backoff.reset();
                this.log('handshake accepted');
            } else if (frame.type === 'ping') {
                this.sendFrame({ v: FRAME_VERSION, type: 'pong', ts: Date.now() });
            }
        });
        socket.on('close', () => {
            this.connected = false;
            this.ws = null;
            this.scheduleReconnect();
        });
        socket.on('error', (err) => {
            this.log(`socket error: ${err instanceof Error ? err.message : 'unknown'}`);
        });
    }

    private scheduleReconnect(): void {
        if (this.stopped) return;
        const delay = this.backoff.next();
        this.log(`reconnecting in ${delay}ms`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
}

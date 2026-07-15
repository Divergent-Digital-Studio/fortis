import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import type { FortisEventBus } from './event-bus'
import type { RestApiState } from '../../shared/types/m6'
import { routeRequest, type RestContext } from './rest/rest-router'

export interface HttpServerLike {
    listen(port: number, host: string, cb: () => void): void
    on(event: 'error', cb: (err: Error) => void): void
    close(cb?: () => void): void
}

interface RestApiServerDeps {
    eventBus: FortisEventBus
    getConfig: () => { enabled: boolean; host: string; port: number }
    getToken: () => string
    data: RestContext['data']
    serverFactory?: (handler: (req: IncomingMessage, res: ServerResponse) => void) => HttpServerLike
}

export class RestApiServer {
    private server: HttpServerLike | null = null
    private listening = false
    private lastError: string | undefined

    constructor(private readonly deps: RestApiServerDeps) {}

    start(): void {
        const cfg = this.deps.getConfig()
        if (!cfg.enabled || this.server) {
            this.emitState()
            return
        }
        if (this.deps.getToken().length === 0) {
            this.lastError = 'REST API not started: set an auth token first'
            console.error('[RestApi] refusing to start without an auth token')
            this.emitState()
            return
        }
        try {
            this.server = this.createServer()
            this.server.on('error', (err) => {
                this.lastError = err.message
                this.listening = false
                this.emitState()
            })
            this.server.listen(cfg.port, cfg.host, () => {
                this.listening = true
                this.lastError = undefined
                this.emitState()
            })
        } catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err)
            this.emitState()
        }
    }

    stop(): void {
        if (this.server) {
            try {
                this.server.close()
            } catch {
                /* already closed */
            }
            this.server = null
        }
        this.listening = false
        this.emitState()
    }

    restart(): void {
        this.stop()
        this.start()
    }

    getState(): RestApiState {
        const cfg = this.deps.getConfig()
        const base: RestApiState = { enabled: cfg.enabled, listening: this.listening, host: cfg.host, port: cfg.port }
        return this.lastError ? { ...base, error: this.lastError } : base
    }

    private handle(req: IncomingMessage, res: ServerResponse): void {
        const method = req.method ?? 'GET'
        const path = (req.url ?? '/').split('?')[0] ?? '/'
        const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
        const result = routeRequest(method, path, authHeader, { token: this.deps.getToken(), data: this.deps.data })
        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.end(result.body)
    }

    private createServer(): HttpServerLike {
        const handler = (req: IncomingMessage, res: ServerResponse): void => this.handle(req, res)
        if (this.deps.serverFactory) return this.deps.serverFactory(handler)
        const server: Server = createServer(handler)
        return {
            listen: (port, host, cb) => server.listen(port, host, cb),
            on: (event, cb) => server.on(event, cb),
            close: (cb) => server.close(cb),
        }
    }

    private emitState(): void {
        this.deps.eventBus.emit('rest:state', this.getState())
    }
}

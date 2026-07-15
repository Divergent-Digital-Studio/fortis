import { timingSafeEqual } from 'node:crypto'

export interface RestContext {
    token: string
    data: {
        health: () => unknown
        connections: () => unknown
        alerts: () => unknown
        agents: () => unknown
    }
}

export interface RestResponse {
    status: number
    body: string
}

function ok(data: unknown): RestResponse {
    return { status: 200, body: JSON.stringify({ success: true, data }) }
}

function err(status: number, message: string): RestResponse {
    return { status, body: JSON.stringify({ success: false, error: { message } }) }
}

function tokenMatches(authHeader: string | undefined, expected: string): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ') || expected.length === 0) return false
    const given = Buffer.from(authHeader.slice('Bearer '.length))
    const want = Buffer.from(expected)
    if (given.length !== want.length) return false
    return timingSafeEqual(given, want)
}

export function routeRequest(
    method: string,
    path: string,
    authHeader: string | undefined,
    ctx: RestContext,
): RestResponse {
    if (!tokenMatches(authHeader, ctx.token)) return err(401, 'unauthorized')
    if (method !== 'GET') return err(405, 'method not allowed')
    switch (path) {
        case '/api/v1/health':
            return ok(ctx.data.health())
        case '/api/v1/connections':
            return ok(ctx.data.connections())
        case '/api/v1/alerts':
            return ok(ctx.data.alerts())
        case '/api/v1/agents':
            return ok(ctx.data.agents())
        default:
            return err(404, 'not found')
    }
}

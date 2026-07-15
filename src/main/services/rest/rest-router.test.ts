import { describe, it, expect } from 'vitest'
import { routeRequest, type RestContext } from './rest-router'

const ctx: RestContext = {
    token: 'secret',
    data: {
        health: () => ({ ok: true, uptime: 10 }),
        connections: () => [{ processName: 'curl', remoteAddress: '1.2.3.4' }],
        alerts: () => [{ id: 'a1', title: 'x' }],
        agents: () => [{ agentId: 'ag1' }],
    },
}

describe('rest-router', () => {
    it('rejects with 401 when the bearer token is missing or wrong', () => {
        expect(routeRequest('GET', '/api/v1/health', undefined, ctx).status).toBe(401)
        expect(routeRequest('GET', '/api/v1/health', 'Bearer nope', ctx).status).toBe(401)
    })
    it('returns 200 + health for an authed request', () => {
        const res = routeRequest('GET', '/api/v1/health', 'Bearer secret', ctx)
        expect(res.status).toBe(200)
        expect(JSON.parse(res.body).data.ok).toBe(true)
    })
    it('serves connections/alerts/agents', () => {
        expect(routeRequest('GET', '/api/v1/connections', 'Bearer secret', ctx).status).toBe(200)
        expect(routeRequest('GET', '/api/v1/alerts', 'Bearer secret', ctx).status).toBe(200)
        expect(routeRequest('GET', '/api/v1/agents', 'Bearer secret', ctx).status).toBe(200)
    })
    it('404s an unknown path and 405s a non-GET', () => {
        expect(routeRequest('GET', '/nope', 'Bearer secret', ctx).status).toBe(404)
        expect(routeRequest('POST', '/api/v1/health', 'Bearer secret', ctx).status).toBe(405)
    })
    it('rejects an empty configured token outright', () => {
        const noTok: RestContext = { ...ctx, token: '' }
        expect(routeRequest('GET', '/api/v1/health', 'Bearer ', noTok).status).toBe(401)
    })
})

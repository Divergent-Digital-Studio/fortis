import { describe, it, expect } from 'vitest'
import { buildSiemPayload } from './siem-payload'
import type { Alert } from '../../../shared/types/alert'

const alert = {
    id: 'a1', dedupKey: 'd1', title: 'Suspicious', description: 'desc',
    recommendation: 'block', threatLevel: 'danger', timestamp: 1000,
    processName: 'curl', remoteAddress: '1.2.3.4', remotePort: 443,
} as unknown as Alert

describe('siem-payload', () => {
    it('builds a Splunk HEC payload with the Splunk auth header', () => {
        const p = buildSiemPayload('splunk', 'https://splunk:8088', 'TOK', alert)
        expect(p.url).toBe('https://splunk:8088')
        expect(p.headers.Authorization).toBe('Splunk TOK')
        expect(JSON.parse(p.body).event.title).toBe('Suspicious')
    })
    it('builds an Elasticsearch bulk payload (ndjson, two lines)', () => {
        const p = buildSiemPayload('elastic', 'https://es:9200', 'TOK', alert)
        const lines = p.body.trim().split('\n')
        expect(lines.length).toBe(2)
        expect(JSON.parse(lines[0]!).index).toBeDefined()
        expect(p.headers['Content-Type']).toBe('application/x-ndjson')
    })
    it('builds a Datadog logs payload with the DD-API-KEY header', () => {
        const p = buildSiemPayload('datadog', 'https://http-intake', 'TOK', alert)
        expect(p.headers['DD-API-KEY']).toBe('TOK')
        expect(JSON.parse(p.body)[0].ddsource).toBe('fortis')
    })
    it('omits the elastic auth header when no token is given', () => {
        const p = buildSiemPayload('elastic', 'https://es:9200', '', alert)
        expect(p.headers.Authorization).toBeUndefined()
    })
})

import type { Alert } from '../../../shared/types/alert'
import type { SiemVendor } from '../../../shared/types/m6'

export interface SiemRequest {
    url: string
    headers: Record<string, string>
    body: string
}

function eventFields(alert: Alert): Record<string, unknown> {
    return {
        title: alert.title,
        description: alert.description,
        threatLevel: alert.threatLevel,
        processName: alert.processName ?? null,
        remoteAddress: alert.remoteAddress ?? null,
        remotePort: alert.remotePort ?? null,
        timestamp: alert.timestamp,
        source: 'fortis',
    }
}

export function buildSiemPayload(
    vendor: SiemVendor,
    endpoint: string,
    token: string,
    alert: Alert,
): SiemRequest {
    const fields = eventFields(alert)
    if (vendor === 'splunk') {
        return {
            url: endpoint,
            headers: { Authorization: `Splunk ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: fields, sourcetype: 'fortis:alert' }),
        }
    }
    if (vendor === 'elastic') {
        const meta = JSON.stringify({ index: { _index: 'fortis-alerts' } })
        const doc = JSON.stringify({ ...fields, '@timestamp': new Date(alert.timestamp).toISOString() })
        return {
            url: endpoint,
            headers: {
                'Content-Type': 'application/x-ndjson',
                ...(token.length > 0 ? { Authorization: `ApiKey ${token}` } : {}),
            },
            body: `${meta}\n${doc}\n`,
        }
    }
    return {
        url: endpoint,
        headers: { 'DD-API-KEY': token, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ ddsource: 'fortis', service: 'network-monitor', message: alert.title, ...fields }]),
    }
}

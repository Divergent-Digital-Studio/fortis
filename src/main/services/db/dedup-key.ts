import { createHash } from 'node:crypto'

type AlertDisposition = 'alert' | 'silent' | 'learning'

interface DedupKeySource {
    disposition?: AlertDisposition | undefined
    ruleId?: string | undefined
    findingType?: string | undefined
    processName?: string | undefined
    remoteAddress?: string | undefined
    remotePort?: number | undefined
}

function buildDedupKey(input: DedupKeySource): string {
    const disposition = input.disposition ?? 'alert'
    const source = input.ruleId ?? input.findingType ?? 'unknown'
    const process = input.processName ?? ''
    const address = input.remoteAddress ?? ''
    const port = input.remotePort !== undefined ? String(input.remotePort) : ''

    const raw = `${disposition}:${source}:${process}:${address}:${port}`
    return createHash('sha256').update(raw).digest('hex')
}

export { buildDedupKey }
export type { AlertDisposition, DedupKeySource }

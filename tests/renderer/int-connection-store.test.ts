import { describe, it, expect, beforeEach } from 'vitest'
import { useConnectionStore } from '@renderer/stores/connection-store'
import type { AIAnalysisResult } from '@shared/types/analysis'

type AnalysisCb = (result: AIAnalysisResult) => void
type ScanStatusCb = (payload: { scanning: boolean; error?: string }) => void
type AlertCb = (alert: unknown) => void
type ConnectionsCb = (connections: unknown[]) => void

let analysisCb: AnalysisCb | null = null
let scanStatusCb: ScanStatusCb | null = null

function installFortisMock(): void {
    analysisCb = null
    scanStatusCb = null
    ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
        onAnalysisUpdate: (cb: AnalysisCb): (() => void) => {
            analysisCb = cb
            return () => { analysisCb = null }
        },
        onScanStatus: (cb: ScanStatusCb): (() => void) => {
            scanStatusCb = cb
            return () => { scanStatusCb = null }
        },
        onNewAlert: (_cb: AlertCb): (() => void) => () => {},
        onConnectionsUpdate: (_cb: ConnectionsCb): (() => void) => () => {},
    }
}

function analysisWithFinding(): AIAnalysisResult {
    return {
        id: 'a1',
        timestamp: Date.now(),
        overallThreatLevel: 'danger',
        healthScore: 50,
        summary: 's',
        findings: [
            {
                id: 'f1',
                connectionId: 'conn-1',
                remoteAddress: '93.184.216.1',
                port: 443,
                process: 'p',
                threatLevel: 'danger',
                confidence: 0.9,
                explanation: 'suspicious',
                recommendation: 'block',
            },
        ],
        newConnections: 0,
        droppedConnections: 0,
        provider: 'openai',
        model: 'gpt',
        tokensUsed: 0,
        costEstimate: 0,
        cached: false,
        latencyMs: 0,
    }
}

function degradedAnalysis(): AIAnalysisResult {
    return {
        id: 'degraded-1',
        timestamp: Date.now(),
        overallThreatLevel: 'info',
        healthScore: 50,
        summary: 'AI analysis temporarily offline. Rule-based monitoring active.',
        findings: [],
        newConnections: 0,
        droppedConnections: 0,
        provider: 'degraded',
        model: 'none',
        tokensUsed: 0,
        costEstimate: 0,
        cached: false,
        latencyMs: 0,
    }
}

beforeEach(() => {
    installFortisMock()
    useConnectionStore.getState().clearConnections()
    useConnectionStore.getState().setScanStatus('idle')
})

describe('INT-01 connection-store consumes AI_ANALYSIS_UPDATE', () => {
    it('onAnalysisUpdate populates the threatMap', () => {
        const cleanup = useConnectionStore.getState().initGlobalSubscriptions()
        expect(analysisCb).toBeTypeOf('function')

        analysisCb!(analysisWithFinding())

        const td = useConnectionStore.getState().getThreatData('conn-1')
        expect(td).toBeDefined()
        expect(td?.threatLevel).toBe('danger')
        expect(td?.source).toBe('ai')
        cleanup()
    })
})

describe('INT-01 degraded analysis does not clobber a prior real analysis', () => {
    it('a degraded placeholder (provider=degraded, healthScore 50, no findings) preserves the real threat map', () => {
        const cleanup = useConnectionStore.getState().initGlobalSubscriptions()
        expect(analysisCb).toBeTypeOf('function')

        analysisCb!(analysisWithFinding())

        const real = useConnectionStore.getState().getThreatData('conn-1')
        expect(real?.threatLevel).toBe('danger')
        expect(real?.source).toBe('ai')

        analysisCb!(degradedAnalysis())

        const afterDegraded = useConnectionStore.getState().getThreatData('conn-1')
        expect(afterDegraded?.threatLevel).toBe('danger')
        expect(afterDegraded?.source).toBe('ai')
        expect(afterDegraded?.explanation).toBe('suspicious')
        cleanup()
    })
})

describe('INT-02 connection-store consumes SCAN_STATUS_UPDATE', () => {
    it('onScanStatus with {scanning:false,error} sets scanStatus to error', () => {
        const cleanup = useConnectionStore.getState().initGlobalSubscriptions()
        expect(scanStatusCb).toBeTypeOf('function')

        scanStatusCb!({ scanning: false, error: 'parser exploded' })
        expect(useConnectionStore.getState().scanStatus).toBe('error')

        scanStatusCb!({ scanning: true })
        expect(useConnectionStore.getState().scanStatus).toBe('scanning')

        scanStatusCb!({ scanning: false })
        expect(useConnectionStore.getState().scanStatus).toBe('idle')
        cleanup()
    })
})

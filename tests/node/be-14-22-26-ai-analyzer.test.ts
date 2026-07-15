import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AIAnalyzerService } from '@main/services/ai-analyzer'
import { AICache } from '@main/utils/ai-cache'
import { ConfidenceScorer } from '@main/services/confidence-scorer'
import { SensitivityTuner } from '@main/services/sensitivity-tuner'
import { TierGatingService } from '@main/services/tier-gating'
import { FortisEventBus } from '@main/services/event-bus'
import type { IDatabaseService } from '@main/services/database'
import type { NetworkConnection } from '@shared/types/connection'
import { SUSPICIOUS_PORTS } from '@main/services/suspicious-indicators'
import type { AIAnalysisResult, AIProviderType, IAIProvider, AnonymizedPayload, AIModelTier } from '@shared/types/analysis'

function makeFakeDb(initial: Record<string, unknown> = {}): IDatabaseService & { _store: Record<string, unknown>; _cache: Map<string, string> } {
    const store: Record<string, unknown> = { tier: 'free', dailyAiScansUsed: 0, lastScanDate: '', aiProvider: 'openai', ...initial }
    const cache = new Map<string, string>()
    return {
        _store: store,
        _cache: cache,
        getSetting: (key: string) => store[key],
        setSetting: (key: string, value: unknown) => { store[key] = value },
        getAnalysisStats: () => ({
            totalCalls: 0, totalTokens: 0, totalCostUSD: 0, callsToday: 0,
            averageLatencyMs: 0, cacheHitRate: 0, providerBreakdown: {},
        }),
        saveAnalysis: () => 'id',
        getCachedResult: (k: string) => cache.get(k) ?? null,
        cacheResult: (k: string, json: string) => { cache.set(k, json) },
        clearExpiredCache: () => 0,
    } as unknown as IDatabaseService & { _store: Record<string, unknown>; _cache: Map<string, string> }
}

function conn(id: string, processName: string, remoteAddress: string, remotePort: number): NetworkConnection {
    return {
        id, protocol: 'tcp', localAddress: '192.0.2.50', localPort: 50000,
        remoteAddress, remotePort, state: 'ESTABLISHED', processName, processId: 1, timestamp: Date.now(),
    }
}

function makeProvider(name: AIProviderType, resultFactory: (payload: AnonymizedPayload) => AIAnalysisResult): { provider: IAIProvider; calls: () => number } {
    let count = 0
    const provider: IAIProvider = {
        name,
        analyzeConnections: async (payload: AnonymizedPayload, _tier: AIModelTier) => {
            count++
            return resultFactory(payload)
        },
        isAvailable: async () => true,
        validateKey: async () => ({ valid: true }),
    }
    return { provider, calls: () => count }
}

function baseResult(overrides: Partial<AIAnalysisResult> = {}): AIAnalysisResult {
    return {
        id: 'r', timestamp: Date.now(), overallThreatLevel: 'safe', healthScore: 100,
        summary: 'ok', findings: [], newConnections: 0, droppedConnections: 0,
        provider: 'openai', model: 'gpt', tokensUsed: 10, costEstimate: 0.001,
        cached: false, latencyMs: 5, ...overrides,
    }
}

describe('BE-22 / BE-23 free-tier auto quota enforced on analyze()', () => {
    let db: ReturnType<typeof makeFakeDb>
    let eventBus: FortisEventBus
    let analyzer: AIAnalyzerService
    let providerCalls: () => number

    beforeEach(() => {
        db = makeFakeDb({ tier: 'free' })
        eventBus = new FortisEventBus()
        const cache = new AICache(db)
        const { provider, calls } = makeProvider('openai', () => baseResult())
        providerCalls = calls
        const tierGating = new TierGatingService(db, eventBus)
        const providers = new Map<AIProviderType, IAIProvider>([['openai', provider]])
        analyzer = new AIAnalyzerService(eventBus, db, cache, providers, new ConfidenceScorer(new SensitivityTuner()), tierGating)
        analyzer.setProvider('openai')
    })

    it('4 auto analyze() calls invoke provider 3 times and 4th is skipped', async () => {
        const skipReasons: string[] = []
        eventBus.on('analysis:skipped', (p) => skipReasons.push(p.reason))

        for (let i = 0; i < 4; i++) {
            await analyzer.analyze({
                newConnections: [conn(`c${i}`, `proc${i}`, `93.184.216.${i}`, 443)],
                droppedConnections: [],
                totalActive: 1,
            })
        }

        expect(providerCalls()).toBe(3)
        expect(db._store.dailyAiScansUsed).toBe(3)
        expect(skipReasons).toContain('free_tier_limit_reached')
    })
})

describe('M2 Ollama provider selection + fallback chain', () => {
    function makeOllamaAnalyzer(aiProvider: string) {
        const db = makeFakeDb({ tier: 'pro', aiProvider })
        const eventBus = new FortisEventBus()
        const cache = new AICache(db)
        const tierGating = new TierGatingService(db, eventBus)
        const providers = new Map<AIProviderType, IAIProvider>([
            ['openai', makeProvider('openai', () => baseResult()).provider],
            ['anthropic', makeProvider('anthropic', () => baseResult()).provider],
            ['ollama', makeProvider('ollama', () => baseResult()).provider],
        ])
        return new AIAnalyzerService(eventBus, db, cache, providers, new ConfidenceScorer(new SensitivityTuner()), tierGating)
    }

    it('restores ollama as the active provider from persisted settings', () => {
        const analyzer = makeOllamaAnalyzer('ollama')
        expect(analyzer.getActiveProvider()).toBe('ollama')
    })

    it('allows setProvider(ollama) at runtime', () => {
        const analyzer = makeOllamaAnalyzer('openai')
        analyzer.setProvider('ollama')
        expect(analyzer.getActiveProvider()).toBe('ollama')
    })
})

describe('BE-22 cached/degraded results do not consume quota', () => {
    it('a cache hit does not increment dailyAiScansUsed', async () => {
        const db = makeFakeDb({ tier: 'free' })
        const eventBus = new FortisEventBus()
        const cache = new AICache(db)

        let shouldFail = false
        const provider: IAIProvider = {
            name: 'openai',
            analyzeConnections: async () => {
                if (shouldFail) throw new Error('forced failure')
                return baseResult()
            },
            isAvailable: async () => true,
            validateKey: async () => ({ valid: true }),
        }
        const tierGating = new TierGatingService(db, eventBus)
        const providers = new Map<AIProviderType, IAIProvider>([['openai', provider]])
        const analyzer = new AIAnalyzerService(eventBus, db, cache, providers, new ConfidenceScorer(new SensitivityTuner()), tierGating)
        analyzer.setProvider('openai')

        const c = conn('cc', 'browser', '93.184.216.40', 443)
        await analyzer.analyze({ newConnections: [c], droppedConnections: [], totalActive: 1 })
        expect(db._store.dailyAiScansUsed).toBe(1)

        shouldFail = true
        const second = await analyzer.analyze({ newConnections: [c], droppedConnections: [], totalActive: 1 })
        expect(second!.cached).toBe(true)
        expect(db._store.dailyAiScansUsed).toBe(1)
    })
})

describe('BE-14 ConfidenceScorer filters AI findings', () => {
    it('low-confidence finding is dropped, high-confidence survives', async () => {
        const db = makeFakeDb({ tier: 'pro' })
        const eventBus = new FortisEventBus()
        const cache = new AICache(db)
        const result = baseResult({
            overallThreatLevel: 'warning',
            findings: [
                { id: 'f1', connectionId: 'c0', remoteAddress: '93.184.216.0', port: 443, process: 'p', threatLevel: 'warning', confidence: 90, explanation: '', recommendation: '' },
                { id: 'f2', connectionId: 'c1', remoteAddress: '93.184.216.1', port: 443, process: 'p', threatLevel: 'warning', confidence: 40, explanation: '', recommendation: '' },
            ],
        })
        const { provider } = makeProvider('openai', () => result)
        const tierGating = new TierGatingService(db, eventBus)
        const providers = new Map<AIProviderType, IAIProvider>([['openai', provider]])
        const analyzer = new AIAnalyzerService(eventBus, db, cache, providers, new ConfidenceScorer(new SensitivityTuner()), tierGating)
        analyzer.setProvider('openai')

        let completed: AIAnalysisResult | null = null
        eventBus.on('analysis:complete', (p) => { completed = p.result })

        await analyzer.analyze({ newConnections: [conn('c0', 'p', '93.184.216.0', 443)], droppedConnections: [], totalActive: 1 })

        expect(completed).not.toBeNull()
        expect(completed!.findings.length).toBe(1)
        expect(completed!.findings[0]!.id).toBe('f1')
    })
})

describe('BE-26 #1/#2 cache per-connection attribution & fresh counts', () => {
    it('cache hit for one connection returns only that connections findings', async () => {
        const db = makeFakeDb({ tier: 'pro' })
        const eventBus = new FortisEventBus()
        const cache = new AICache(db)

        const findingA = { id: 'fa', connectionId: 'ca', remoteAddress: '93.184.216.10', port: 443, process: 'pa', threatLevel: 'warning' as const, confidence: 90, explanation: '', recommendation: '' }
        const findingB = { id: 'fb', connectionId: 'cb', remoteAddress: '93.184.216.11', port: 80, process: 'pb', threatLevel: 'danger' as const, confidence: 95, explanation: '', recommendation: '' }

        let shouldFail = false
        let count = 0
        const provider: IAIProvider = {
            name: 'openai',
            analyzeConnections: async () => {
                count++
                if (shouldFail) throw new Error('forced failure')
                return baseResult({ overallThreatLevel: 'danger', findings: [findingA, findingB], newConnections: 2 })
            },
            isAvailable: async () => true,
            validateKey: async () => ({ valid: true }),
        }
        void count
        const tierGating = new TierGatingService(db, eventBus)
        const providers = new Map<AIProviderType, IAIProvider>([['openai', provider]])
        const analyzer = new AIAnalyzerService(eventBus, db, cache, providers, new ConfidenceScorer(new SensitivityTuner()), tierGating)
        analyzer.setProvider('openai')

        const ca = conn('ca', 'pa', '93.184.216.10', 443)
        const cb = conn('cb', 'pb', '93.184.216.11', 80)
        await analyzer.analyze({ newConnections: [ca, cb], droppedConnections: [], totalActive: 2 })

        let cachedResult: AIAnalysisResult | null = null
        eventBus.on('analysis:cached', (p) => { cachedResult = p.result })

        shouldFail = true
        const second = await analyzer.analyze({ newConnections: [ca], droppedConnections: [], totalActive: 1 })

        const hit = cachedResult ?? second
        expect(hit).not.toBeNull()
        const findingIds = hit!.findings.map((f) => f.id)
        expect(findingIds).toContain('fa')
        expect(findingIds).not.toContain('fb')
        expect(hit!.newConnections).toBe(1)
    })
})

describe('BE-22 concurrent analyze() at remaining=1 consumes the quota exactly once', () => {
    it('two concurrent analyze() calls at remaining=1: exactly one runs the provider, counter never exceeds limit', async () => {
        const db = makeFakeDb({ tier: 'free', dailyAiScansUsed: 2, lastScanDate: new Date().toISOString().slice(0, 10) })
        const eventBus = new FortisEventBus()
        const cache = new AICache(db)

        let release: (() => void) | null = null
        const gate = new Promise<void>((resolve) => { release = resolve })
        let providerCalls = 0

        const provider: IAIProvider = {
            name: 'openai',
            analyzeConnections: async () => {
                providerCalls++
                await gate
                return baseResult()
            },
            isAvailable: async () => true,
            validateKey: async () => ({ valid: true }),
        }
        const tierGating = new TierGatingService(db, eventBus)
        const providers = new Map<AIProviderType, IAIProvider>([['openai', provider]])
        const analyzer = new AIAnalyzerService(eventBus, db, cache, providers, new ConfidenceScorer(new SensitivityTuner()), tierGating)
        analyzer.setProvider('openai')

        const callA = analyzer.analyze({ newConnections: [conn('ca', 'pa', '93.184.216.10', 443)], droppedConnections: [], totalActive: 1 })
        const callB = analyzer.analyze({ newConnections: [conn('cb', 'pb', '93.184.216.11', 444)], droppedConnections: [], totalActive: 1 })

        await Promise.resolve()
        release!()
        const [resA, resB] = await Promise.all([callA, callB])

        expect(providerCalls).toBe(1)
        expect(db._store.dailyAiScansUsed).toBe(3)

        const succeeded = [resA, resB].filter((r) => r && r.provider !== 'degraded' && !r.cached)
        const blocked = [resA, resB].filter((r) => r === null)
        expect(succeeded.length).toBe(1)
        expect(blocked.length).toBe(1)
    })
})

describe('BE-24 determineTier escalates to critical for every shared suspicious port', () => {
    it('each SUSPICIOUS_PORTS value yields the critical model tier', async () => {
        for (const port of SUSPICIOUS_PORTS) {
            const db = makeFakeDb({ tier: 'pro' })
            const eventBus = new FortisEventBus()
            const cache = new AICache(db)
            let observedTier: AIModelTier | null = null
            const provider: IAIProvider = {
                name: 'openai',
                analyzeConnections: async (_payload, tier) => {
                    observedTier = tier
                    return baseResult()
                },
                isAvailable: async () => true,
                validateKey: async () => ({ valid: true }),
            }
            const tierGating = new TierGatingService(db, eventBus)
            const providers = new Map<AIProviderType, IAIProvider>([['openai', provider]])
            const analyzer = new AIAnalyzerService(eventBus, db, cache, providers, new ConfidenceScorer(new SensitivityTuner()), tierGating)
            analyzer.setProvider('openai')

            await analyzer.analyze({
                newConnections: [conn('cx', 'proc', '93.184.216.77', port)],
                droppedConnections: [],
                totalActive: 1,
            })

            expect(observedTier, `port ${port}`).toBe('critical')
        }
    })
})

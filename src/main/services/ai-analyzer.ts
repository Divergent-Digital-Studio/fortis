import { randomUUID } from 'crypto';
import type { FortisEventBus } from './event-bus';
import type { IDatabaseService } from './database';
import type { NetworkConnection } from '../../shared/types/connection';
import type {
    IAIProvider,
    AIProviderType,
    AIModelTier,
    AIAnalysisResult,
    AIUsageStats,
    AnonymizedPayload,
} from '../../shared/types/analysis';
import type { AICache } from '../utils/ai-cache';
import { CircuitBreaker, CircuitOpenError, RateLimitError } from '../utils/circuit-breaker';
import { anonymize } from '../utils/anonymizer';
import { SUSPICIOUS_PORTS } from './suspicious-indicators';
import { AIProviderError } from './providers/openai-provider';
import type { ConfidenceScorer } from './confidence-scorer';
import type { TierGatingService } from './tier-gating';

type FallbackLayer = 'rule_engine' | 'primary_ai' | 'secondary_ai' | 'cache' | 'degraded';

interface ProviderEntry {
    provider: IAIProvider;
    circuitBreaker: CircuitBreaker;
}

interface UsageSnapshot {
    totalCalls: number;
    totalTokens: number;
    totalCostUSD: number;
    callsToday: number;
    latencySum: number;
    cacheHits: number;
    cacheMisses: number;
    providerCalls: Record<AIProviderType, { calls: number; tokens: number; costUSD: number }>;
    lastResetDate: string;
}

interface FallbackTransition {
    timestamp: number;
    fromLayer: FallbackLayer;
    toLayer: FallbackLayer;
    reason: string;
    provider?: string;
}

const MAX_PROVIDER_TIMEOUT_MS = 90_000;
const HEALTH_SCORE_FLOOR_WHEN_NO_FINDINGS = 90;
const DEGRADED_MESSAGE = 'AI analysis temporarily offline. Rule-based monitoring active.';

function todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

function buildDegradedResult(): AIAnalysisResult {
    return {
        id: randomUUID(),
        timestamp: Date.now(),
        overallThreatLevel: 'info',
        healthScore: 50,
        summary: DEGRADED_MESSAGE,
        findings: [],
        newConnections: 0,
        droppedConnections: 0,
        provider: 'degraded',
        model: 'none',
        tokensUsed: 0,
        costEstimate: 0,
        cached: false,
        latencyMs: 0,
    };
}

class AIAnalyzerService {
    private readonly eventBus: FortisEventBus;
    private readonly db: IDatabaseService;
    private readonly cache: AICache;
    private readonly providers: Map<AIProviderType, ProviderEntry>;
    private readonly confidenceScorer: ConfidenceScorer | null;
    private readonly tierGating: TierGatingService | null;
    private activeProviderType: AIProviderType | null = null;
    private secondaryProviderType: AIProviderType | null = null;
    private readonly usage: UsageSnapshot;
    private readonly fallbackLog: FallbackTransition[] = [];
    private inDegradedMode = false;
    private disposed = false;
    private lastSentPayload: AnonymizedPayload | null = null;

    constructor(
        eventBus: FortisEventBus,
        db: IDatabaseService,
        cache: AICache,
        providerInstances: Map<AIProviderType, IAIProvider>,
        confidenceScorer?: ConfidenceScorer,
        tierGating?: TierGatingService,
    ) {
        this.eventBus = eventBus;
        this.db = db;
        this.cache = cache;
        this.confidenceScorer = confidenceScorer ?? null;
        this.tierGating = tierGating ?? null;

        this.providers = new Map();
        for (const [type, provider] of providerInstances) {
            this.providers.set(type, {
                provider,
                circuitBreaker: new CircuitBreaker({
                    name: `ai-${type}`,
                    failureThreshold: 5,
                    resetTimeoutMs: 30_000,
                    maxCallsPerHour: 60,
                }),
            });
        }

        this.usage = {
            totalCalls: 0,
            totalTokens: 0,
            totalCostUSD: 0,
            callsToday: 0,
            latencySum: 0,
            cacheHits: 0,
            cacheMisses: 0,
            providerCalls: {
                openai: { calls: 0, tokens: 0, costUSD: 0 },
                anthropic: { calls: 0, tokens: 0, costUSD: 0 },
                ollama: { calls: 0, tokens: 0, costUSD: 0 },
            },
            lastResetDate: todayDateString(),
        };

        this.hydrateFromDatabase();
        this.loadProviderFromSettings();
    }

    async analyze(
        diff: { newConnections: NetworkConnection[]; droppedConnections: NetworkConnection[]; totalActive: number },
    ): Promise<AIAnalysisResult | null> {
        if (this.disposed) return null;

        if (!this.activeProviderType) {
            this.eventBus.emit('analysis:skipped', { reason: 'ai_disabled' });
            return null;
        }

        const allConnections = [...diff.newConnections];
        if (allConnections.length === 0) {
            this.eventBus.emit('analysis:skipped', { reason: 'no_connections_to_analyze' });
            return null;
        }

        const tier: AIModelTier = this.determineTier(diff);
        const newIds = new Set(diff.newConnections.map((c) => c.id));
        const payload = anonymize(allConnections, newIds);

        if (payload.connections.length === 0) {
            this.eventBus.emit('analysis:skipped', { reason: 'all_connections_filtered' });
            return null;
        }

        const reservation = this.reserveScan();
        if (!reservation.allowed) {
            this.eventBus.emit('analysis:skipped', { reason: 'free_tier_limit_reached' });
            return null;
        }

        let result: AIAnalysisResult | null;
        try {
            result = await this.executeWithFallback(
                payload,
                tier,
                diff.newConnections.length,
                diff.droppedConnections.length,
            );
        } catch (error) {
            this.refundScan(reservation);
            throw error;
        }

        if (!result || result.provider === 'degraded' || result.cached) {
            this.refundScan(reservation);
        }

        return result;
    }

    async analyzeFull(connections: NetworkConnection[]): Promise<AIAnalysisResult> {
        if (this.disposed) {
            return buildDegradedResult();
        }

        if (!this.activeProviderType) {
            this.eventBus.emit('analysis:skipped', { reason: 'ai_disabled' });
            return buildDegradedResult();
        }

        const reservation = this.reserveScan();
        if (!reservation.allowed) {
            this.eventBus.emit('analysis:skipped', { reason: 'free_tier_limit_reached' });
            return buildDegradedResult();
        }

        const payload = anonymize(connections);
        const tier: AIModelTier = 'critical';

        this.eventBus.emit('analysis:start', {
            connectionCount: connections.length,
            provider: this.activeProviderType ?? 'none',
        });

        let result: AIAnalysisResult | null;
        try {
            result = await this.executeWithFallback(payload, tier, connections.length, 0);
        } catch (error) {
            this.refundScan(reservation);
            throw error;
        }

        if (result && result.provider !== 'degraded' && !result.cached) {
            return result;
        }

        this.refundScan(reservation);
        return result ?? buildDegradedResult();
    }

    setProvider(type: AIProviderType): void {
        if (!this.providers.has(type)) {
            console.warn(`[AIAnalyzer] Provider "${type}" not registered`);
            return;
        }

        const previousType = this.activeProviderType;
        this.activeProviderType = type;

        this.secondaryProviderType = this.resolveSecondaryProvider(type);

        this.db.setSetting('aiProvider', type);

        if (previousType !== type) {
            console.info(`[AIAnalyzer] Switched provider from "${previousType}" to "${type}"`);
        }
    }

    disableProvider(): void {
        const previousType = this.activeProviderType;
        this.activeProviderType = null;
        this.secondaryProviderType = null;
        this.db.setSetting('aiProvider', 'none' as AIProviderType);

        this.eventBus.emit('ai:provider-disabled', {});

        if (previousType !== null) {
            console.info(`[AIAnalyzer] AI provider disabled (was "${previousType}") — no API calls will be made.`);
        }
    }

    getActiveProvider(): AIProviderType | null {
        return this.activeProviderType;
    }

    getLastSentPayload(): AnonymizedPayload | null {
        return this.lastSentPayload;
    }

    getUsageStats(): AIUsageStats {
        this.maybeResetDailyCounters();

        const totalCalls = this.usage.totalCalls;
        const averageLatencyMs = totalCalls > 0 ? Math.round(this.usage.latencySum / totalCalls) : 0;
        const totalLookups = this.usage.cacheHits + this.usage.cacheMisses;
        const cacheHitRate = totalLookups > 0 ? this.usage.cacheHits / totalLookups : 0;

        return {
            totalCalls,
            totalTokens: this.usage.totalTokens,
            totalCostUSD: this.usage.totalCostUSD,
            callsToday: this.usage.callsToday,
            averageLatencyMs,
            cacheHitRate,
            providerBreakdown: { ...this.usage.providerCalls },
        };
    }

    async isAvailable(): Promise<boolean> {
        if (this.disposed) return false;
        if (!this.activeProviderType) return false;

        const entry = this.providers.get(this.activeProviderType);
        if (!entry) return false;

        const cbState = entry.circuitBreaker.getState();
        if (cbState === 'OPEN') return false;

        return entry.provider.isAvailable();
    }

    isInDegradedMode(): boolean {
        return this.inDegradedMode;
    }

    getFallbackLog(): FallbackTransition[] {
        return [...this.fallbackLog];
    }

    dispose(): void {
        this.disposed = true;
    }

    private async executeWithFallback(
        payload: AnonymizedPayload,
        tier: AIModelTier,
        newCount: number,
        droppedCount: number,
    ): Promise<AIAnalysisResult | null> {
        const layers: FallbackLayer[] = ['primary_ai', 'secondary_ai', 'cache', 'degraded'];
        let previousLayer: FallbackLayer = 'rule_engine';
        let lastFailureReason = '';

        for (const layer of layers) {
            try {
                const result = await this.attemptLayer(layer, payload, tier, newCount, droppedCount);
                if (result) {
                    if (this.inDegradedMode && layer !== 'degraded') {
                        this.exitDegradedMode();
                    }
                    return result;
                }
                lastFailureReason = `Layer "${layer}" returned null`;
            } catch (error) {
                lastFailureReason = error instanceof Error ? error.message : String(error);
                this.logLayerFailure(layer, error);
            }

            this.recordFallbackTransition(previousLayer, layer, lastFailureReason);
            previousLayer = layer;
        }

        return buildDegradedResult();
    }

    private async attemptLayer(
        layer: FallbackLayer,
        payload: AnonymizedPayload,
        tier: AIModelTier,
        newCount: number,
        droppedCount: number,
    ): Promise<AIAnalysisResult | null> {
        switch (layer) {
            case 'rule_engine':
                return null;

            case 'primary_ai':
                return this.attemptProviderAnalysis(
                    this.activeProviderType,
                    payload,
                    tier,
                    newCount,
                    droppedCount,
                    'primary_ai',
                );

            case 'secondary_ai':
                return this.attemptProviderAnalysis(
                    this.secondaryProviderType,
                    payload,
                    tier,
                    newCount,
                    droppedCount,
                    'secondary_ai',
                );

            case 'cache':
                return this.attemptCacheLookup(payload, newCount, droppedCount);

            case 'degraded':
                return this.enterDegradedMode();

            default:
                return null;
        }
    }

    private async attemptProviderAnalysis(
        providerType: AIProviderType | null,
        payload: AnonymizedPayload,
        tier: AIModelTier,
        newCount: number,
        droppedCount: number,
        layerName: FallbackLayer,
    ): Promise<AIAnalysisResult | null> {
        if (!providerType) return null;

        const entry = this.providers.get(providerType);
        if (!entry) return null;

        const cbState = entry.circuitBreaker.getState();
        if (cbState === 'OPEN') {
            const retryInfo = `failures=${entry.circuitBreaker.getFailureCount()}, remaining=${entry.circuitBreaker.getRemainingCalls()}`;
            console.warn(`[AIAnalyzer] Circuit breaker for "${providerType}" is OPEN (${retryInfo}), skipping ${layerName}`);
            this.emitFallbackEvent(
                layerName,
                layerName === 'primary_ai' ? 'secondary_ai' : 'cache',
                `Circuit breaker OPEN for ${providerType}`,
                providerType,
            );
            return null;
        }

        const available = await entry.provider.isAvailable();
        if (!available) {
            console.warn(`[AIAnalyzer] Provider "${providerType}" is not available for ${layerName}`);
            this.emitFallbackEvent(
                layerName,
                layerName === 'primary_ai' ? 'secondary_ai' : 'cache',
                `Provider ${providerType} unavailable`,
                providerType,
            );
            return null;
        }

        this.lastSentPayload = payload;

        this.eventBus.emit('analysis:start', {
            connectionCount: payload.connections.length,
            provider: providerType,
        });

        try {
            const result = await entry.circuitBreaker.execute(async () => {
                const budgetSignal = AbortSignal.timeout(MAX_PROVIDER_TIMEOUT_MS);
                return entry.provider.analyzeConnections(payload, tier, budgetSignal);
            });

            const enrichedResult: AIAnalysisResult = {
                ...result,
                newConnections: newCount,
                droppedConnections: droppedCount,
            };

            this.onAnalysisSuccess(enrichedResult, providerType);
            this.cacheResult(payload, enrichedResult);

            console.info(`[AIAnalyzer] ${layerName} (${providerType}) succeeded`);

            return enrichedResult;
        } catch (error) {
            const fallbackUsed = providerType !== this.activeProviderType;
            const nextLayer: FallbackLayer = layerName === 'primary_ai' ? 'secondary_ai' : 'cache';

            this.eventBus.emit('analysis:error', {
                error: error instanceof Error ? error : new Error(String(error)),
                provider: providerType,
                fallbackUsed,
            });

            if (error instanceof CircuitOpenError) {
                console.warn(`[AIAnalyzer] ${layerName}: Circuit breaker tripped for "${providerType}" — ${error.message}`);
                this.emitFallbackEvent(layerName, nextLayer, `Circuit breaker tripped: ${error.message}`, providerType);
            } else if (error instanceof RateLimitError) {
                console.warn(`[AIAnalyzer] ${layerName}: Rate limit hit for "${providerType}" — ${error.message}`);
                this.emitFallbackEvent(layerName, nextLayer, `Rate limit exceeded: ${error.message}`, providerType);
            } else if (error instanceof AIProviderError && !error.retryable) {
                console.error(`[AIAnalyzer] ${layerName}: Non-retryable error from "${providerType}": ${error.message}`);
                this.emitFallbackEvent(layerName, nextLayer, `Non-retryable: ${error.message}`, providerType);
            } else {
                const msg = error instanceof Error ? error.message : String(error);
                console.warn(`[AIAnalyzer] ${layerName}: Provider "${providerType}" failed: ${msg}`);
                this.emitFallbackEvent(layerName, nextLayer, msg, providerType);
            }

            return null;
        }
    }

    private attemptCacheLookup(
        payload: AnonymizedPayload,
        newCount: number,
        droppedCount: number,
    ): AIAnalysisResult | null {
        const { createHash } = require('crypto') as typeof import('crypto');

        const cachedProjections: AIAnalysisResult[] = [];

        for (const conn of payload.connections) {
            const cacheKey = `${conn.processName}|${conn.remoteAddress}|${conn.remotePort}`;
            const key = createHash('sha256').update(cacheKey).digest('hex');

            const cached = this.cache.get(key);
            if (!cached) {
                this.usage.cacheMisses++;
                console.warn('[AIAnalyzer] Cache layer: all-or-nothing miss — at least one connection uncached');
                this.emitFallbackEvent('cache', 'degraded', 'Uncached connection pattern in batch');
                return null;
            }
            cachedProjections.push(cached);
        }

        if (cachedProjections.length === 0) {
            this.usage.cacheMisses++;
            this.emitFallbackEvent('cache', 'degraded', 'No connections to look up');
            return null;
        }

        this.usage.cacheHits++;

        const mergedFindings = cachedProjections.flatMap((p) => p.findings);

        const levelOrder = ['safe', 'info', 'warning', 'danger', 'critical'] as const;
        let overallThreatLevel: AIAnalysisResult['overallThreatLevel'] = 'safe';
        for (const f of mergedFindings) {
            if (levelOrder.indexOf(f.threatLevel) > levelOrder.indexOf(overallThreatLevel)) {
                overallThreatLevel = f.threatLevel;
            }
        }

        const template = cachedProjections[0]!;

        const result: AIAnalysisResult = {
            ...template,
            id: randomUUID(),
            timestamp: Date.now(),
            cached: true,
            latencyMs: 0,
            findings: mergedFindings,
            overallThreatLevel,
            newConnections: newCount,
            droppedConnections: droppedCount,
            summary: mergedFindings.length > 0
                ? `Cached analysis: ${mergedFindings.length} finding(s) for the current scan.`
                : 'Cached analysis: no threats found for the current scan.',
        };

        console.info('[AIAnalyzer] Cache hit: all connections in batch served from cache');
        this.eventBus.emit('analysis:cached', { result });
        return result;
    }

    private enterDegradedMode(): AIAnalysisResult {
        const result = buildDegradedResult();

        if (!this.inDegradedMode) {
            this.inDegradedMode = true;
            console.warn(`[AIAnalyzer] ENTERING degraded mode — ${DEGRADED_MESSAGE}`);
            this.eventBus.emit('analysis:degraded', {
                active: true,
                message: DEGRADED_MESSAGE,
            });
        }

        this.eventBus.emit('analysis:complete', { result });

        return result;
    }

    private exitDegradedMode(): void {
        if (!this.inDegradedMode) return;
        this.inDegradedMode = false;
        console.info('[AIAnalyzer] EXITING degraded mode — AI provider recovered');
        this.eventBus.emit('analysis:degraded', {
            active: false,
            message: 'AI analysis restored. Full monitoring active.',
        });
    }

    private onAnalysisSuccess(result: AIAnalysisResult, providerType: AIProviderType): void {
        this.maybeResetDailyCounters();

        this.usage.totalCalls++;
        this.usage.callsToday++;
        this.usage.totalTokens += result.tokensUsed;
        this.usage.totalCostUSD += result.costEstimate;
        this.usage.latencySum += result.latencyMs;

        const breakdown = this.usage.providerCalls[providerType];
        if (breakdown) {
            breakdown.calls++;
            breakdown.tokens += result.tokensUsed;
            breakdown.costUSD += result.costEstimate;
        }

        const filteredResult = this.filterAIFindings(result);

        this.db.saveAnalysis(filteredResult);

        this.eventBus.emit('analysis:complete', { result: filteredResult });
    }

    private filterAIFindings(result: AIAnalysisResult): AIAnalysisResult {
        if (!this.confidenceScorer || result.findings.length === 0) {
            return result;
        }

        const filteredFindings = result.findings.filter((finding) => {
            const filterResult = this.confidenceScorer!.filterAIFinding(
                finding.confidence,
                finding.threatLevel,
            );
            return filterResult.shouldAlert;
        });

        if (filteredFindings.length === result.findings.length) {
            return result;
        }

        const levelOrder = ['safe', 'info', 'warning', 'danger', 'critical'] as const;
        type TLevel = typeof levelOrder[number];
        let maxLevel: TLevel = 'safe';
        for (const f of filteredFindings) {
            const idx = levelOrder.indexOf(f.threatLevel as TLevel);
            if (idx > levelOrder.indexOf(maxLevel)) {
                maxLevel = levelOrder[idx] ?? 'safe';
            }
        }

        if (filteredFindings.length === 0) {
            return {
                ...result,
                findings: filteredFindings,
                overallThreatLevel: 'safe',
                healthScore: Math.max(result.healthScore, HEALTH_SCORE_FLOOR_WHEN_NO_FINDINGS),
                summary: 'No findings met the confidence threshold for the current sensitivity level. No action required.',
            };
        }

        return {
            ...result,
            findings: filteredFindings,
            overallThreatLevel: maxLevel,
        };
    }

    private cacheResult(payload: AnonymizedPayload, result: AIAnalysisResult): void {
        const { createHash } = require('crypto') as typeof import('crypto');

        for (const conn of payload.connections) {
            const cacheInput = `${conn.processName}|${conn.remoteAddress}|${conn.remotePort}`;
            const key = createHash('sha256').update(cacheInput).digest('hex');

            const connFindings = result.findings.filter(
                (f) => f.connectionId === conn.id,
            );

            const levelOrder = ['safe', 'info', 'warning', 'danger', 'critical'] as const;
            let connLevel: AIAnalysisResult['overallThreatLevel'] = 'safe';
            for (const f of connFindings) {
                if (levelOrder.indexOf(f.threatLevel) > levelOrder.indexOf(connLevel)) {
                    connLevel = f.threatLevel;
                }
            }

            const projection: AIAnalysisResult = {
                ...result,
                overallThreatLevel: connLevel,
                findings: connFindings,
                newConnections: 0,
                droppedConnections: 0,
                summary: '',
            };

            this.cache.set(key, projection);
        }
    }

    private determineTier(diff: {
        newConnections: NetworkConnection[];
        droppedConnections: NetworkConnection[];
        totalActive: number;
    }): AIModelTier {
        if (diff.newConnections.length > 20) return 'critical';

        const hasSuspiciousPort = diff.newConnections.some((c) => SUSPICIOUS_PORTS.has(c.remotePort));

        if (hasSuspiciousPort) return 'critical';

        return 'routine';
    }

    private hydrateFromDatabase(): void {
        try {
            const dbStats = this.db.getAnalysisStats();
            this.usage.totalCalls = dbStats.totalCalls;
            this.usage.totalTokens = dbStats.totalTokens;
            this.usage.totalCostUSD = dbStats.totalCostUSD;
            this.usage.callsToday = dbStats.callsToday;
            this.usage.latencySum = dbStats.averageLatencyMs * dbStats.totalCalls;

            const openaiBreakdown = dbStats.providerBreakdown['openai'];
            if (openaiBreakdown) {
                this.usage.providerCalls.openai = { ...openaiBreakdown };
            }
            const anthropicBreakdown = dbStats.providerBreakdown['anthropic'];
            if (anthropicBreakdown) {
                this.usage.providerCalls.anthropic = { ...anthropicBreakdown };
            }
            const ollamaBreakdown = dbStats.providerBreakdown['ollama'];
            if (ollamaBreakdown) {
                this.usage.providerCalls.ollama = { ...ollamaBreakdown };
            }

            if (dbStats.totalCalls > 0 && dbStats.cacheHitRate > 0) {
                const cachedCount = Math.round(dbStats.totalCalls * dbStats.cacheHitRate);
                this.usage.cacheHits = cachedCount;
                this.usage.cacheMisses = dbStats.totalCalls - cachedCount;
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[AIAnalyzer] Failed to hydrate usage from database: ${msg}`);
        }
    }

    private loadProviderFromSettings(): void {
        const settingValue = this.db.getSetting('aiProvider');

        if (typeof settingValue === 'string' && this.providers.has(settingValue as AIProviderType)) {
            const providerType = settingValue as AIProviderType;
            this.activeProviderType = providerType;
            this.secondaryProviderType = this.resolveSecondaryProvider(providerType);
        }
    }

    private resolveSecondaryProvider(primaryType: AIProviderType): AIProviderType | null {
        const allTypes: AIProviderType[] = ['openai', 'anthropic', 'ollama'];
        const secondary = allTypes.find((t) => t !== primaryType && this.providers.has(t));
        return secondary ?? null;
    }

    private reserveScan(): { allowed: boolean; consumed: boolean } {
        if (this.tierGating) {
            const result = this.tierGating.tryConsumeScan();
            return { allowed: result.allowed, consumed: result.allowed && result.remaining !== Infinity };
        }

        const tier = this.db.getSetting('tier');
        return { allowed: tier !== 'free', consumed: false };
    }

    private refundScan(reservation: { allowed: boolean; consumed: boolean }): void {
        if (!reservation.consumed) return;
        if (this.tierGating) {
            this.tierGating.refundScan();
        }
    }

    private maybeResetDailyCounters(): void {
        const today = todayDateString();

        if (this.usage.lastResetDate !== today) {
            this.usage.callsToday = 0;
            this.usage.lastResetDate = today;
        }
    }

    private emitFallbackEvent(
        fromLayer: FallbackLayer,
        toLayer: FallbackLayer,
        reason: string,
        provider?: string,
    ): void {
        this.eventBus.emit('analysis:fallback', {
            fromLayer,
            toLayer,
            reason,
            ...(provider !== undefined ? { provider } : {}),
        });
    }

    private recordFallbackTransition(
        fromLayer: FallbackLayer,
        toLayer: FallbackLayer,
        reason: string,
    ): void {
        const transition: FallbackTransition = {
            timestamp: Date.now(),
            fromLayer,
            toLayer,
            reason,
        };
        this.fallbackLog.push(transition);

        if (this.fallbackLog.length > 100) {
            this.fallbackLog.splice(0, this.fallbackLog.length - 100);
        }

        console.warn(`[AIAnalyzer] Fallback: ${fromLayer} → ${toLayer} (${reason})`);
    }

    private logLayerFailure(layer: FallbackLayer, error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[AIAnalyzer] Layer "${layer}" failed: ${message}`);
    }
}

export { AIAnalyzerService, buildDegradedResult };

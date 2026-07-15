import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { randomUUID } from 'crypto';
import type {
    IAIProvider,
    AIProviderType,
    AIModelTier,
    AIAnalysisResult,
    AnonymizedPayload,
} from '../../../shared/types/analysis';
import type { DatabaseService } from '../database';
import { AIProviderError } from './openai-provider';
import {
    analyzeWithRetry,
    estimatePromptTokens,
} from '../ai-prompt';

interface ModelConfig {
    modelId: string;
    maxTokens: number;
}

interface TokenCost {
    inputPerMillion: number;
    outputPerMillion: number;
}

const MODEL_TIERS: Record<AIModelTier, ModelConfig> = {
    routine: { modelId: 'claude-3-haiku-20240307', maxTokens: 2000 },
    critical: { modelId: 'claude-sonnet-4-20250514', maxTokens: 4000 },
};

const MODEL_PRICING: Record<string, TokenCost> = {
    'claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
    'claude-sonnet-4-20250514': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
};

const TEMPERATURE = 0.1;

interface UsageTracker {
    totalCalls: number;
    totalTokens: number;
    totalCostUSD: number;
    totalLatencyMs: number;
}

function classifyAnthropicError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) {
        return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const statusMatch = errorMessage.match(/status (\d{3})/i);
    const statusCode = statusMatch ? parseInt(statusMatch[1]!, 10) : 0;

    if (statusCode === 429 || errorMessage.includes('rate_limit') || errorMessage.includes('too many requests')) {
        return new AIProviderError(
            'Anthropic rate limit exceeded',
            'RATE_LIMIT',
            429,
            true,
        );
    }

    if (statusCode === 401 || errorMessage.includes('invalid x-api-key') || errorMessage.includes('authentication_error')) {
        return new AIProviderError(
            'Invalid Anthropic API key',
            'AUTH_FAILURE',
            401,
            false,
        );
    }

    if (statusCode === 529 || errorMessage.includes('overloaded')) {
        return new AIProviderError(
            'Anthropic API is overloaded',
            'OVERLOADED',
            529,
            true,
        );
    }

    if (statusCode >= 500 || errorMessage.includes('server_error') || errorMessage.includes('internal_error')) {
        return new AIProviderError(
            `Anthropic server error: ${errorMessage}`,
            'SERVER_ERROR',
            statusCode || 500,
            true,
        );
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNABORTED')) {
        return new AIProviderError(
            'Anthropic request timed out',
            'TIMEOUT',
            0,
            true,
        );
    }

    return new AIProviderError(
        `Anthropic error: ${errorMessage}`,
        'UNKNOWN',
        statusCode || 0,
        false,
    );
}

function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[modelId];
    if (!pricing) return 0;
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

class AnthropicProvider implements IAIProvider {
    readonly name: AIProviderType = 'anthropic';
    private readonly db: DatabaseService;
    private readonly usage: UsageTracker = {
        totalCalls: 0,
        totalTokens: 0,
        totalCostUSD: 0,
        totalLatencyMs: 0,
    };

    constructor(db: DatabaseService) {
        this.db = db;
    }

    async analyzeConnections(payload: AnonymizedPayload, tier: AIModelTier, signal?: AbortSignal): Promise<AIAnalysisResult> {
        const apiKey = this.retrieveApiKey();
        if (!apiKey) {
            throw new AIProviderError('Anthropic API key not configured', 'AUTH_FAILURE', 401, false);
        }

        try {
            const modelConfig = MODEL_TIERS[tier];
            const anthropic = createAnthropic({ apiKey });

            const tokenEstimate = estimatePromptTokens(payload, tier, modelConfig.maxTokens);
            if (tokenEstimate.nearLimit) {
                console.warn(
                    `[Anthropic] Token estimate ${tokenEstimate.totalEstimate} is near limit ${tokenEstimate.limitThreshold}`,
                );
            }

            const startTime = Date.now();

            const { result, totalInputTokens, totalOutputTokens, attempts } = await analyzeWithRetry(
                payload,
                tier,
                async (systemPrompt, userPrompt, attemptSignal) => {
                    const { text, usage } = await generateText({
                        model: anthropic(modelConfig.modelId),
                        system: systemPrompt,
                        prompt: userPrompt,
                        temperature: TEMPERATURE,
                        maxOutputTokens: modelConfig.maxTokens,
                        abortSignal: attemptSignal,
                    });

                    return {
                        text,
                        inputTokens: usage?.inputTokens ?? 0,
                        outputTokens: usage?.outputTokens ?? 0,
                    };
                },
                signal,
            );

            const latencyMs = Date.now() - startTime;
            const totalTokens = totalInputTokens + totalOutputTokens;
            const costEstimate = estimateCost(modelConfig.modelId, totalInputTokens, totalOutputTokens);

            if (attempts > 1) {
                console.warn(`[Anthropic] Analysis succeeded after ${attempts} attempts`);
            }

            this.trackUsage(totalTokens, costEstimate, latencyMs);

            return {
                id: randomUUID(),
                timestamp: Date.now(),
                ...result,
                provider: 'anthropic',
                model: modelConfig.modelId,
                tokensUsed: totalTokens,
                costEstimate,
                cached: false,
                latencyMs,
            };
        } catch (error) {
            throw classifyAnthropicError(error);
        }
    }

    async isAvailable(): Promise<boolean> {
        const storedKey = this.db.getSetting('anthropicApiKey');
        return !!storedKey && storedKey.length > 0;
    }

    async validateKey(keyToValidate?: string): Promise<{ valid: boolean; error?: string }> {
        let apiKey: string | undefined = undefined;

        if (keyToValidate) {
            apiKey = keyToValidate;
        } else {
            const retrieved = this.retrieveApiKey();
            if (!retrieved) return { valid: false, error: 'No API key configured' };
            apiKey = retrieved;
        }

        try {
            const anthropic = createAnthropic({ apiKey });
            await generateText({
                model: anthropic('claude-3-haiku-20240307'),
                prompt: 'Respond with "ok"',
                maxOutputTokens: 16,
                abortSignal: AbortSignal.timeout(15_000),
            });
            return { valid: true };
        } catch (error) {
            const classified = classifyAnthropicError(error);
            return { valid: false, error: classified.message };
        }
    }

    getUsage(): Readonly<UsageTracker> {
        return { ...this.usage };
    }

    private retrieveApiKey(): string | null {
        const storedKey = this.db.getSetting('anthropicApiKey');
        if (!storedKey) return null;

        return storedKey as string;
    }

    private trackUsage(tokens: number, cost: number, latency: number): void {
        this.usage.totalCalls++;
        this.usage.totalTokens += tokens;
        this.usage.totalCostUSD += cost;
        this.usage.totalLatencyMs += latency;
    }
}

export { AnthropicProvider, classifyAnthropicError };


import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { randomUUID } from 'crypto';
import type {
    IAIProvider,
    AIProviderType,
    AIModelTier,
    AIAnalysisResult,
    AnonymizedPayload,
} from '../../../shared/types/analysis';
import type { DatabaseService } from '../database';
import {
    buildSystemPrompt,
    buildUserPrompt,
    parseAIResponse,
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
    routine: { modelId: 'gpt-4o-mini', maxTokens: 2000 },
    critical: { modelId: 'gpt-4o', maxTokens: 4000 },
};

const MODEL_PRICING: Record<string, TokenCost> = {
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
    'gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
};

const TEMPERATURE = 0.1;

interface UsageTracker {
    totalCalls: number;
    totalTokens: number;
    totalCostUSD: number;
    totalLatencyMs: number;
}

class AIProviderError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly retryable: boolean;

    constructor(message: string, code: string, statusCode: number, retryable: boolean) {
        super(message);
        this.name = 'AIProviderError';
        this.code = code;
        this.statusCode = statusCode;
        this.retryable = retryable;
    }
}

function classifyError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) {
        return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const statusMatch = errorMessage.match(/status (\d{3})/i);
    const statusCode = statusMatch ? parseInt(statusMatch[1]!, 10) : 0;

    if (statusCode === 429 || errorMessage.includes('rate_limit')) {
        return new AIProviderError(
            'OpenAI rate limit exceeded',
            'RATE_LIMIT',
            429,
            true,
        );
    }

    if (statusCode === 401 || errorMessage.includes('Incorrect API key') || errorMessage.includes('invalid_api_key')) {
        return new AIProviderError(
            'Invalid OpenAI API key',
            'AUTH_FAILURE',
            401,
            false,
        );
    }

    if (statusCode >= 500 || errorMessage.includes('server_error')) {
        return new AIProviderError(
            `OpenAI server error: ${errorMessage}`,
            'SERVER_ERROR',
            statusCode || 500,
            true,
        );
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNABORTED')) {
        return new AIProviderError(
            'OpenAI request timed out',
            'TIMEOUT',
            0,
            true,
        );
    }

    return new AIProviderError(
        `OpenAI error: ${errorMessage}`,
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

class OpenAIProvider implements IAIProvider {
    readonly name: AIProviderType = 'openai';
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

    private clientOptions(apiKey: string): { apiKey: string; baseURL?: string } {
        const endpoint = this.db.getSetting('openaiCompatibleEndpoint');
        if (typeof endpoint === 'string' && /^https?:\/\//.test(endpoint)) {
            return { apiKey, baseURL: endpoint };
        }
        return { apiKey };
    }

    async analyzeConnections(payload: AnonymizedPayload, tier: AIModelTier, signal?: AbortSignal): Promise<AIAnalysisResult> {
        const apiKey = this.retrieveApiKey();
        if (!apiKey) {
            throw new AIProviderError('OpenAI API key not configured', 'AUTH_FAILURE', 401, false);
        }

        try {
            const modelConfig = MODEL_TIERS[tier];
            const openai = createOpenAI(this.clientOptions(apiKey));

            const tokenEstimate = estimatePromptTokens(payload, tier, modelConfig.maxTokens);
            if (tokenEstimate.nearLimit) {
                console.warn(
                    `[OpenAI] Token estimate ${tokenEstimate.totalEstimate} is near limit ${tokenEstimate.limitThreshold}`,
                );
            }

            const startTime = Date.now();

            const { result, totalInputTokens, totalOutputTokens, attempts } = await analyzeWithRetry(
                payload,
                tier,
                async (systemPrompt, userPrompt, attemptSignal) => {
                    const { text, usage } = await generateText({
                        model: openai(modelConfig.modelId),
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
                console.warn(`[OpenAI] Analysis succeeded after ${attempts} attempts`);
            }

            this.trackUsage(totalTokens, costEstimate, latencyMs);

            return {
                id: randomUUID(),
                timestamp: Date.now(),
                ...result,
                provider: 'openai',
                model: modelConfig.modelId,
                tokensUsed: totalTokens,
                costEstimate,
                cached: false,
                latencyMs,
            };
        } catch (error) {
            throw classifyError(error);
        }
    }

    async isAvailable(): Promise<boolean> {
        const storedKey = this.db.getSetting('openaiApiKey');
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
            const openai = createOpenAI(this.clientOptions(apiKey));
            await generateText({
                model: openai('gpt-4o-mini'),
                prompt: 'Respond with "ok"',
                maxOutputTokens: 16,
                abortSignal: AbortSignal.timeout(15_000),
            });
            return { valid: true };
        } catch (error) {
            const classified = classifyError(error);
            return { valid: false, error: classified.message };
        }
    }

    getUsage(): Readonly<UsageTracker> {
        return { ...this.usage };
    }

    private retrieveApiKey(): string | null {
        const storedKey = this.db.getSetting('openaiApiKey');
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

export { OpenAIProvider, AIProviderError, classifyError, parseAIResponse, estimateCost, buildSystemPrompt, buildUserPrompt };

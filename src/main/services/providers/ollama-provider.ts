import { randomUUID } from 'crypto';
import type {
    IAIProvider,
    AIProviderType,
    AIModelTier,
    AIAnalysisResult,
    AnonymizedPayload,
} from '../../../shared/types/analysis';
import type { OllamaModelsResult } from '../../../shared/types/m2';
import type { DatabaseService } from '../database';
import { AIProviderError } from './openai-provider';
import { analyzeWithRetry } from '../ai-prompt';
import { parseOllamaChat, parseOllamaTags } from './ollama-parse';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
const AVAILABILITY_TIMEOUT_MS = 2_500;
const CHAT_TIMEOUT_MS = 120_000;
const TEMPERATURE = 0.1;

interface OllamaChatResponse {
    prompt_eval_count?: number;
    eval_count?: number;
}

let lastUnavailableLog = 0;

function logUnavailable(reason: string): void {
    const now = Date.now();
    if (now - lastUnavailableLog > 30_000) {
        lastUnavailableLog = now;
        console.warn(`[OllamaProvider] Local model endpoint unavailable: ${reason}`);
    }
}

function normalizeEndpoint(endpoint: string): string {
    return endpoint.replace(/\/+$/, '');
}

class OllamaProvider implements IAIProvider {
    readonly name: AIProviderType = 'ollama';
    private readonly db: DatabaseService;

    constructor(db: DatabaseService) {
        this.db = db;
    }

    private endpoint(): string {
        const stored = this.db.getSetting('ollamaEndpoint');
        return normalizeEndpoint(typeof stored === 'string' && stored.length > 0 ? stored : DEFAULT_ENDPOINT);
    }

    private model(): string {
        const stored = this.db.getSetting('ollamaModel');
        return typeof stored === 'string' ? stored : '';
    }

    async analyzeConnections(payload: AnonymizedPayload, tier: AIModelTier, signal?: AbortSignal): Promise<AIAnalysisResult> {
        const endpoint = this.endpoint();
        const model = this.model();

        if (!model) {
            throw new AIProviderError('No Ollama model configured', 'AUTH_FAILURE', 0, false);
        }

        const startTime = Date.now();

        const { result, totalInputTokens, totalOutputTokens } = await analyzeWithRetry(
            payload,
            tier,
            async (systemPrompt, userPrompt, attemptSignal) => {
                let response: Response;
                const signals: AbortSignal[] = [AbortSignal.timeout(CHAT_TIMEOUT_MS)];
                if (attemptSignal) signals.push(attemptSignal);
                const chatSignal = AbortSignal.any(signals);
                try {
                    response = await fetch(`${endpoint}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userPrompt },
                            ],
                            stream: false,
                            format: 'json',
                            options: { temperature: TEMPERATURE },
                        }),
                        signal: chatSignal,
                    });
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    throw new AIProviderError(`Ollama request failed: ${reason}`, 'SERVER_ERROR', 0, true);
                }

                if (!response.ok) {
                    throw new AIProviderError(`Ollama HTTP ${response.status}`, 'SERVER_ERROR', response.status, response.status >= 500);
                }

                const raw = await response.text();
                const text = parseOllamaChat(raw);
                if (text === null) {
                    throw new AIProviderError('Ollama returned an unparseable response', 'SERVER_ERROR', 0, true);
                }

                let usage: OllamaChatResponse = {};
                try {
                    usage = JSON.parse(raw) as OllamaChatResponse;
                } catch {
                    usage = {};
                }

                return {
                    text,
                    inputTokens: usage.prompt_eval_count ?? 0,
                    outputTokens: usage.eval_count ?? 0,
                };
            },
            signal,
        );

        const latencyMs = Date.now() - startTime;

        return {
            id: randomUUID(),
            timestamp: Date.now(),
            ...result,
            provider: 'ollama',
            model,
            tokensUsed: totalInputTokens + totalOutputTokens,
            costEstimate: 0,
            cached: false,
            latencyMs,
        };
    }

    async isAvailable(): Promise<boolean> {
        const tags = await this.fetchTags();
        if (!tags.available) return false;
        const model = this.model();
        if (!model) return tags.models.length > 0;
        return tags.models.includes(model);
    }

    async validateKey(): Promise<{ valid: boolean; error?: string }> {
        const tags = await this.fetchTags();
        if (!tags.available) {
            return { valid: false, error: `Could not reach Ollama at ${this.endpoint()}` };
        }
        if (tags.models.length === 0) {
            return { valid: false, error: 'Ollama is running but has no models installed' };
        }
        return { valid: true };
    }

    async discoverModels(endpoint?: string): Promise<OllamaModelsResult> {
        return this.fetchTags(endpoint);
    }

    private async fetchTags(endpointOverride?: string): Promise<OllamaModelsResult> {
        const endpoint = normalizeEndpoint(
            endpointOverride && endpointOverride.length > 0 ? endpointOverride : this.endpoint(),
        );

        try {
            const response = await fetch(`${endpoint}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
            });
            if (!response.ok) {
                logUnavailable(`HTTP ${response.status}`);
                return { models: [], available: false };
            }
            const raw = await response.text();
            return { models: parseOllamaTags(raw), available: true };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            logUnavailable(reason);
            return { models: [], available: false };
        }
    }
}

export { OllamaProvider, CHAT_TIMEOUT_MS };

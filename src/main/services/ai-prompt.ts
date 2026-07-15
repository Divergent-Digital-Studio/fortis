import { z } from 'zod';
import { randomUUID } from 'crypto';
import type {
    AIAnalysisResult,
    AIModelTier,
    AnonymizedPayload,
    ThreatLevel,
    AIFinding,
} from '../../shared/types/analysis';

const VALID_THREAT_LEVELS: ReadonlySet<string> = new Set([
    'safe',
    'info',
    'warning',
    'danger',
    'critical',
]);

const FORTIS_BASE_PROMPT = `You are Fortis AI Security Analyzer, a network security expert that analyzes network connections for potential threats.

You MUST respond with ONLY valid JSON matching this exact schema:
{
  "overallThreatLevel": "safe" | "info" | "warning" | "danger" | "critical",
  "healthScore": 0-100,
  "summary": "Brief summary of findings in plain, non-technical language",
  "findings": [
    {
      "connectionId": "id of the suspicious connection",
      "remoteAddress": "IP address",
      "port": port_number,
      "process": "process name",
      "threatLevel": "safe" | "info" | "warning" | "danger" | "critical",
      "confidence": 0-100,
      "explanation": "Plain-language explanation of the potential threat",
      "recommendation": "What the user should do",
      "category": "Category like 'malicious_port', 'unknown_process', 'data_exfiltration', etc."
    }
  ],
  "newConnections": number_of_new_connections,
  "droppedConnections": number_of_dropped_connections
}

Rules:
1. NEVER hallucinate threats — only flag genuinely suspicious activity.
2. Consider common legitimate services (HTTPS/443, DNS/53, NTP/123).
3. Explain findings in plain English a non-technical user can understand.
4. Assess each connection by: remote IP reputation, port purpose, process legitimacy, and connection patterns.
5. healthScore 100 = perfectly safe, 0 = severe compromise.
6. confidence reflects how certain you are about each finding (0-100).
7. Do NOT wrap JSON in markdown code blocks. Return raw JSON only.`;

const CRITICAL_MODE_SUFFIX = `

MODE: CRITICAL — Perform a thorough, deep analysis of EVERY connection. Evaluate all potential risks. This is a user-triggered full security scan.`;

const ROUTINE_MODE_SUFFIX = `

MODE: ROUTINE — Focus primarily on anomalies, new connections, and suspicious patterns. Briefly note known-safe services. Optimize for speed and conciseness.`;

const RETRY_CLARIFICATION_PROMPT = 'Your previous response was not valid JSON. Please respond with ONLY a raw JSON object matching the schema exactly. Do not include markdown code blocks, explanations, or any text outside the JSON object.';

const findingSchema = z.object({
    id: z.string().optional(),
    connectionId: z.string().default(''),
    remoteAddress: z.string().default(''),
    port: z.number().default(0),
    process: z.string().default(''),
    threatLevel: z.enum(['safe', 'info', 'warning', 'danger', 'critical']).default('info'),
    confidence: z.number().min(0).max(100).default(50),
    explanation: z.string().default(''),
    recommendation: z.string().default(''),
    category: z.string().optional(),
    description: z.string().optional(),
});

const analysisResponseSchema = z.object({
    overallThreatLevel: z.enum(['safe', 'info', 'warning', 'danger', 'critical']),
    healthScore: z.number().min(0).max(100).default(100),
    summary: z.string().default('No summary provided'),
    findings: z.array(findingSchema).default([]),
    newConnections: z.number().default(0),
    droppedConnections: z.number().default(0),
});

type AnalysisResponseCore = z.infer<typeof analysisResponseSchema>;

class PromptValidationError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly rawResponse: string;

    constructor(message: string, rawResponse: string, retryable = true) {
        super(message);
        this.name = 'PromptValidationError';
        this.code = 'MALFORMED_RESPONSE';
        this.retryable = retryable;
        this.rawResponse = rawResponse;
    }
}

function buildSystemPrompt(tier: AIModelTier): string {
    if (tier === 'critical') {
        return FORTIS_BASE_PROMPT + CRITICAL_MODE_SUFFIX;
    }
    return FORTIS_BASE_PROMPT + ROUTINE_MODE_SUFFIX;
}

function buildUserPrompt(payload: AnonymizedPayload): string {
    const connectionsSummary = payload.connections.map((conn) => {
        const flags: string[] = [];
        if (conn.isNew) flags.push('NEW');
        if (conn.isChanged) flags.push('CHANGED');
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';

        return `- ${conn.processName} (${conn.protocol}) → ${conn.remoteAddress}:${conn.remotePort} [${conn.state}]${flagStr}`;
    }).join('\n');

    return `Analyze these ${payload.totalActive} active network connections on ${payload.platform}:

${connectionsSummary}

Scan timestamp: ${new Date(payload.scanTimestamp).toISOString()}
New connections: ${payload.connections.filter((c) => c.isNew).length}`;
}

function buildRetryUserPrompt(originalPayload: AnonymizedPayload, _attemptNumber: number): string {
    return `${RETRY_CLARIFICATION_PROMPT}

${buildUserPrompt(originalPayload)}`;
}

function extractJsonText(rawText: string): string {
    const jsonBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
        return jsonBlockMatch[1]!.trim();
    }

    const trimmed = rawText.trim();

    if (trimmed.startsWith('{')) {
        return trimmed;
    }

    const objectMatch = rawText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        return objectMatch[0];
    }

    return trimmed;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function isValidThreatLevel(value: unknown): value is ThreatLevel {
    return typeof value === 'string' && VALID_THREAT_LEVELS.has(value);
}

function parseAIResponse(rawText: string): Omit<AIAnalysisResult, 'id' | 'timestamp' | 'provider' | 'model' | 'tokensUsed' | 'costEstimate' | 'cached' | 'latencyMs'> {
    const jsonText = extractJsonText(rawText);

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new PromptValidationError(
            'Response is not valid JSON',
            rawText,
            true,
        );
    }

    if (typeof parsed !== 'object' || parsed === null) {
        throw new PromptValidationError(
            'Response is not a JSON object',
            rawText,
            true,
        );
    }

    const zodResult = analysisResponseSchema.safeParse(parsed);

    if (zodResult.success) {
        const validated = zodResult.data;
        return {
            overallThreatLevel: validated.overallThreatLevel,
            healthScore: validated.healthScore,
            summary: validated.summary,
            findings: validated.findings.map(mapZodFindingToAIFinding),
            newConnections: validated.newConnections,
            droppedConnections: validated.droppedConnections,
        };
    }

    return parseAIResponseFallback(parsed as Record<string, unknown>, rawText);
}

function mapZodFindingToAIFinding(f: z.infer<typeof findingSchema>): AIFinding {
    const finding: AIFinding = {
        id: f.id ?? randomUUID(),
        connectionId: f.connectionId,
        remoteAddress: f.remoteAddress,
        port: f.port,
        process: f.process,
        threatLevel: f.threatLevel,
        confidence: clamp(f.confidence, 0, 100),
        explanation: f.explanation,
        recommendation: f.recommendation,
    };
    if (f.category) finding.category = f.category;
    if (f.description) finding.description = f.description;
    return finding;
}

function parseAIResponseFallback(
    response: Record<string, unknown>,
    rawText: string,
): Omit<AIAnalysisResult, 'id' | 'timestamp' | 'provider' | 'model' | 'tokensUsed' | 'costEstimate' | 'cached' | 'latencyMs'> {
    if (!isValidThreatLevel(response.overallThreatLevel)) {
        throw new PromptValidationError(
            `Invalid overallThreatLevel: ${String(response.overallThreatLevel)}`,
            rawText,
            true,
        );
    }

    const healthScore = typeof response.healthScore === 'number'
        ? clamp(response.healthScore, 0, 100)
        : 100;

    const summary = typeof response.summary === 'string'
        ? response.summary
        : 'No summary provided';

    const rawFindings = Array.isArray(response.findings) ? response.findings : [];
    const findings: AIFinding[] = rawFindings
        .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
        .map((f) => {
            const finding: AIFinding = {
                id: typeof f.id === 'string' ? f.id : randomUUID(),
                connectionId: typeof f.connectionId === 'string' ? f.connectionId : '',
                remoteAddress: typeof f.remoteAddress === 'string' ? f.remoteAddress : '',
                port: typeof f.port === 'number' ? f.port : 0,
                process: typeof f.process === 'string' ? f.process : '',
                threatLevel: isValidThreatLevel(f.threatLevel) ? f.threatLevel : 'info',
                confidence: typeof f.confidence === 'number' ? clamp(f.confidence, 0, 100) : 50,
                explanation: typeof f.explanation === 'string' ? f.explanation : '',
                recommendation: typeof f.recommendation === 'string' ? f.recommendation : '',
            };
            if (typeof f.category === 'string') finding.category = f.category;
            if (typeof f.description === 'string') finding.description = f.description;
            return finding;
        });

    const newConnections = typeof response.newConnections === 'number' ? response.newConnections : 0;
    const droppedConnections = typeof response.droppedConnections === 'number' ? response.droppedConnections : 0;

    return {
        overallThreatLevel: response.overallThreatLevel,
        healthScore,
        summary,
        findings,
        newConnections,
        droppedConnections,
    };
}

const MAX_RETRIES = 2;

interface RetryableAnalyzeFn {
    (systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}

const PER_ATTEMPT_TIMEOUT_MS = 60_000;

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
    const defined = signals.filter((s): s is AbortSignal => s !== undefined);
    return AbortSignal.any(defined);
}

async function analyzeWithRetry(
    payload: AnonymizedPayload,
    tier: AIModelTier,
    analyzeFn: RetryableAnalyzeFn,
    outerSignal?: AbortSignal,
): Promise<{
    result: Omit<AIAnalysisResult, 'id' | 'timestamp' | 'provider' | 'model' | 'tokensUsed' | 'costEstimate' | 'cached' | 'latencyMs'>;
    totalInputTokens: number;
    totalOutputTokens: number;
    attempts: number;
}> {
    const systemPrompt = buildSystemPrompt(tier);
    let lastError: Error | null = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const userPrompt = attempt === 0
            ? buildUserPrompt(payload)
            : buildRetryUserPrompt(payload, attempt);

        try {
            const attemptSignal = combineSignals([outerSignal, AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS)]);
            const { text, inputTokens, outputTokens } = await analyzeFn(systemPrompt, userPrompt, attemptSignal);
            totalInputTokens += inputTokens;
            totalOutputTokens += outputTokens;

            const result = parseAIResponse(text);

            return {
                result,
                totalInputTokens,
                totalOutputTokens,
                attempts: attempt + 1,
            };
        } catch (error) {
            if (error instanceof PromptValidationError && error.retryable && attempt < MAX_RETRIES) {
                lastError = error;
                continue;
            }
            throw error;
        }
    }

    throw lastError ?? new PromptValidationError('Max retries exceeded', '', false);
}

const CHARS_PER_TOKEN_ESTIMATE = 4;
const OVERHEAD_TOKENS = 200;

interface TokenEstimate {
    systemTokens: number;
    userTokens: number;
    totalEstimate: number;
    nearLimit: boolean;
    limitThreshold: number;
}

function estimateTokenCount(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

function estimatePromptTokens(payload: AnonymizedPayload, tier: AIModelTier, modelMaxOutputTokens: number): TokenEstimate {
    const systemPrompt = buildSystemPrompt(tier);
    const userPrompt = buildUserPrompt(payload);

    const systemTokens = estimateTokenCount(systemPrompt);
    const userTokens = estimateTokenCount(userPrompt);
    const totalEstimate = systemTokens + userTokens + OVERHEAD_TOKENS;

    const contextLimits: Record<string, number> = {
        'gpt-4o-mini': 128_000,
        'gpt-4o': 128_000,
        'claude-3-5-haiku-20241022': 200_000,
        'claude-3-5-sonnet-20241022': 200_000,
    };

    const modelId = tier === 'routine' ? 'gpt-4o-mini' : 'gpt-4o';
    const contextLimit = contextLimits[modelId] ?? 128_000;
    const limitThreshold = contextLimit - modelMaxOutputTokens;
    const nearLimit = totalEstimate > limitThreshold * 0.8;

    return {
        systemTokens,
        userTokens,
        totalEstimate,
        nearLimit,
        limitThreshold,
    };
}

export {
    FORTIS_BASE_PROMPT,
    CRITICAL_MODE_SUFFIX,
    ROUTINE_MODE_SUFFIX,
    RETRY_CLARIFICATION_PROMPT,
    analysisResponseSchema,
    findingSchema,
    PromptValidationError,
    buildSystemPrompt,
    buildUserPrompt,
    buildRetryUserPrompt,
    parseAIResponse,
    analyzeWithRetry,
    estimateTokenCount,
    estimatePromptTokens,
    MAX_RETRIES,
};

export type {
    AnalysisResponseCore,
    RetryableAnalyzeFn,
    TokenEstimate,
};

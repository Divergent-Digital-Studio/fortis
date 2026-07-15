export interface AgentConfig {
    serverUrl: string;
    token: string;
    scanIntervalMs: number;
    rulesPath: string | null;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const DEFAULT_SCAN_INTERVAL = 10000;
const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

export function loadAgentConfig(raw: string, env: Record<string, string | undefined>): AgentConfig {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Invalid agent config: not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid agent config: expected an object');
    }
    const obj = parsed as Record<string, unknown>;
    const serverUrl = typeof obj.serverUrl === 'string' ? obj.serverUrl : '';
    if (!serverUrl) throw new Error('Invalid agent config: serverUrl is required');
    const tokenFromEnv = env.FORTIS_AGENT_TOKEN;
    const token =
        (typeof tokenFromEnv === 'string' && tokenFromEnv) || (typeof obj.token === 'string' ? obj.token : '');
    if (!token) throw new Error('Invalid agent config: token is required');
    const scanIntervalMs =
        typeof obj.scanIntervalMs === 'number' && obj.scanIntervalMs >= 1000
            ? obj.scanIntervalMs
            : DEFAULT_SCAN_INTERVAL;
    const rulesPath = typeof obj.rulesPath === 'string' ? obj.rulesPath : null;
    const logLevel =
        typeof obj.logLevel === 'string' && VALID_LOG_LEVELS.has(obj.logLevel)
            ? (obj.logLevel as AgentConfig['logLevel'])
            : 'info';
    return { serverUrl, token, scanIntervalMs, rulesPath, logLevel };
}

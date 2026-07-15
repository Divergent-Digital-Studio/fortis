import { createHash } from 'node:crypto';

export function deriveAgentId(hostname: string, platform: string): string {
    return createHash('sha256').update(`${hostname}:${platform}`).digest('hex').slice(0, 12);
}

export function agentLabel(hostname: string, platform: string): string {
    return `${hostname} (${platform})`;
}

import type { Alert } from '../../../shared/types/alert';
import type { WebhookKind } from '../../../shared/types/m3';

export function inferWebhookKind(url: string): WebhookKind {
    const u = url.toLowerCase();
    if (u.includes('hooks.slack.com') || u.includes('slack.com')) return 'slack';
    if (u.includes('discord.com') || u.includes('discordapp.com')) return 'discord';
    return 'generic';
}

function summary(alert: Alert): string {
    return `[Fortis] ${alert.title} (${alert.threatLevel})\n${alert.description}\nRecommendation: ${alert.recommendation}`;
}

export function buildWebhookBody(kind: WebhookKind, alert: Alert): unknown {
    switch (kind) {
        case 'slack':
            return { text: summary(alert) };
        case 'discord':
            return { content: summary(alert) };
        case 'generic':
        default:
            return {
                source: 'fortis',
                title: alert.title,
                threatLevel: alert.threatLevel,
                description: alert.description,
                recommendation: alert.recommendation,
                processName: alert.processName ?? null,
                remoteAddress: alert.remoteAddress ?? null,
                timestamp: alert.timestamp,
            };
    }
}

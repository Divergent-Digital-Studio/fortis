import { readFileSync } from 'node:fs';
import { hostname, platform as osPlatform } from 'node:os';
import WebSocket from 'ws';
import { loadAgentConfig } from './config';
import { parseRules, evaluateConnectionsToAlerts } from './agent-rules';
import { AgentLink, type WsLike } from './agent-link';
import { deriveAgentId } from '../shared/remote/agent-id';
import { PlatformParserFactory } from '../main/utils/parsers/parser-factory';
import { ScanScheduler } from '../main/services/scan-scheduler';
import { NetworkMonitor } from '../main/services/network-monitor';
import { FortisEventBus } from '../main/services/event-bus';
import { createNoopPowerSource } from '../main/services/power-source';
import type { CustomRule } from '../shared/types/m3';
import type { NetworkConnection } from '../shared/types/connection';

function arg(flag: string): string | null {
    const i = process.argv.indexOf(flag);
    return i >= 0 && i + 1 < process.argv.length ? (process.argv[i + 1] ?? null) : null;
}

function log(msg: string): void {
    console.log(`[Agent] ${msg}`);
}

function main(): void {
    const configPath = arg('--config');
    if (!configPath) {
        console.error('[Agent] --config <path> is required');
        process.exit(1);
        return;
    }
    let raw: string;
    try {
        raw = readFileSync(configPath, 'utf8');
    } catch (err) {
        console.error(`[Agent] cannot read config: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
        return;
    }
    const config = loadAgentConfig(raw, process.env);

    let rules: CustomRule[] = [];
    if (config.rulesPath) {
        try {
            rules = parseRules(readFileSync(config.rulesPath, 'utf8'));
        } catch {
            log('rules file unreadable; running with no rules');
        }
    }

    const host = hostname();
    const plat = osPlatform();
    const agentId = deriveAgentId(host, plat);

    const wsFactory = (url: string): WsLike => new WebSocket(url) as unknown as WsLike;
    const link = new AgentLink({
        serverUrl: config.serverUrl,
        token: config.token,
        agentId,
        platform: plat,
        wsFactory,
        log,
    });

    const bus = new FortisEventBus();
    const parser = PlatformParserFactory.getParser();
    const scheduler = new ScanScheduler(bus, {
        baseInterval: config.scanIntervalMs,
        adaptiveEnabled: false,
        powerSource: createNoopPowerSource(),
    });
    const monitor = new NetworkMonitor(bus, scheduler, parser);

    bus.on('scan:complete', (p: { connections: NetworkConnection[] }) => {
        link.sendConnections(p.connections);
        const alerts = evaluateConnectionsToAlerts(rules, p.connections, Date.now());
        for (const a of alerts) link.sendAlert(a);
    });
    bus.on('scan:error', (p: { error: Error }) => {
        log(`scan failed: ${p.error.message}; will retry next tick`);
    });

    link.start();
    monitor.start();
    log(`started as ${agentId} (${plat}) -> ${config.serverUrl}`);

    const shutdown = (): void => {
        log('shutting down');
        monitor.stop();
        scheduler.destroy();
        link.stop();
        bus.destroy();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main();

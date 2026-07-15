import { execFile } from 'node:child_process';
import type { DatabaseService } from './database';
import type { FortisEventBus } from './event-bus';
import type { DefenseAction, BlockedIp } from '@shared/types/m3';
import { buildBlockCommand, buildUnblockCommand } from './defense/firewall-rule-builder';
import { buildKillCommand } from './defense/kill-command';

export interface RunResult {
    code: number;
    stdout: string;
    stderr: string;
}

export type RunCommand = (cmd: string, args: string[]) => Promise<RunResult>;

const defaultRunCommand: RunCommand = (cmd, args) =>
    new Promise((resolve) => {
        execFile(cmd, args, { timeout: 10000 }, (err, stdout, stderr) => {
            const code = err
                ? typeof (err as { code?: number }).code === 'number'
                    ? (err as { code: number }).code
                    : 1
                : 0;
            resolve({ code, stdout: String(stdout), stderr: String(stderr) });
        });
    });

interface DefenseServiceDeps {
    database: DatabaseService;
    eventBus: FortisEventBus;
    platform?: NodeJS.Platform;
    runCommand?: RunCommand;
}

export class DefenseService {
    private platform: NodeJS.Platform;
    private run: RunCommand;

    constructor(private deps: DefenseServiceDeps) {
        this.platform = deps.platform ?? process.platform;
        this.run = deps.runCommand ?? defaultRunCommand;
    }

    getActions(): DefenseAction[] {
        return this.deps.database.getDefenseActions();
    }

    getBlockedIps(): BlockedIp[] {
        return this.deps.database.getBlockedIps(true);
    }

    cancelAction(actionId: string): DefenseAction[] {
        const action = this.deps.database.getDefenseAction(actionId);
        if (action && action.status === 'pending') {
            this.deps.database.updateDefenseActionStatus(actionId, 'cancelled', null, null);
        }
        return this.emitActions();
    }

    async confirmKill(actionId: string): Promise<DefenseAction[]> {
        const action = this.deps.database.getDefenseAction(actionId);
        if (!action || action.status !== 'pending' || action.kind !== 'kill') {
            return this.getActions();
        }
        const pid = Number(action.target);
        try {
            const { cmd, args } = buildKillCommand(this.platform, pid);
            const res = await this.run(cmd, args);
            if (res.code === 0) {
                this.deps.database.updateDefenseActionStatus(actionId, 'executed', Date.now(), null);
            } else {
                this.deps.database.updateDefenseActionStatus(actionId, 'failed', null, res.stderr || `exit ${res.code}`);
            }
        } catch (err) {
            this.deps.database.updateDefenseActionStatus(
                actionId,
                'failed',
                null,
                err instanceof Error ? err.message : String(err),
            );
        }
        return this.emitActions();
    }

    async confirmBlock(actionId: string): Promise<DefenseAction[]> {
        const action = this.deps.database.getDefenseAction(actionId);
        if (!action || action.status !== 'pending' || action.kind !== 'block') {
            return this.getActions();
        }
        const ip = action.target;
        try {
            const { cmd, args } = buildBlockCommand(this.platform, ip);
            const res = await this.run(cmd, args);
            if (res.code === 0) {
                this.deps.database.updateDefenseActionStatus(actionId, 'executed', Date.now(), null);
                this.deps.database.insertBlockedIp({
                    ip,
                    blockedAt: Date.now(),
                    reason: action.reason,
                    platform: this.platform,
                    active: true,
                });
            } else {
                this.deps.database.updateDefenseActionStatus(actionId, 'failed', null, res.stderr || `exit ${res.code}`);
            }
        } catch (err) {
            this.deps.database.updateDefenseActionStatus(
                actionId,
                'failed',
                null,
                err instanceof Error ? err.message : String(err),
            );
        }
        return this.emitActions();
    }

    async unblock(ip: string): Promise<BlockedIp[]> {
        try {
            const { cmd, args } = buildUnblockCommand(this.platform, ip);
            const res = await this.run(cmd, args);
            if (res.code !== 0) {
                console.error(`[Defense] unblock failed for ${ip}: ${res.stderr || `exit ${res.code}`}`);
            }
        } catch (err) {
            console.error(`[Defense] unblock error for ${ip}:`, err instanceof Error ? err.message : String(err));
        }
        this.deps.database.setBlockedIpInactive(ip);
        return this.getBlockedIps();
    }

    private emitActions(): DefenseAction[] {
        const actions = this.deps.database.getDefenseActions();
        this.deps.eventBus.emit('defense:updated', { actions });
        return actions;
    }
}

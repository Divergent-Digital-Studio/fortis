import type { ShellCommand } from './firewall-rule-builder';

export function buildKillCommand(platform: NodeJS.Platform, pid: number): ShellCommand {
    if (!Number.isInteger(pid) || pid <= 0) {
        throw new Error(`[Defense] Invalid pid: ${pid}`);
    }
    if (platform === 'win32') {
        return { cmd: 'taskkill', args: ['/PID', String(pid), '/F'] };
    }
    return { cmd: 'kill', args: ['-TERM', String(pid)] };
}

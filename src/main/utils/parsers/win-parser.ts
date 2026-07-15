import { execFile } from 'node:child_process';
import type { NetworkConnection, ConnectionState, Protocol } from '@shared/types';
import type { SupportedPlatform } from '../platform';
import { generateConnectionId } from '../connection-id';
import type { IConnectionParser } from './parser.interface';

const COMMAND_TIMEOUT_MS = 15_000;

const STATE_MAP: Record<string, ConnectionState> = {
    ESTABLISHED: 'ESTABLISHED',
    LISTENING: 'LISTEN',
    LISTEN: 'LISTEN',
    SYN_SENT: 'SYN_SENT',
    SYN_RECV: 'SYN_RECV',
    SYN_RECEIVED: 'SYN_RECV',
    FIN_WAIT_1: 'FIN_WAIT1',
    FIN_WAIT_2: 'FIN_WAIT2',
    TIME_WAIT: 'TIME_WAIT',
    CLOSE_WAIT: 'CLOSE_WAIT',
    LAST_ACK: 'LAST_ACK',
    CLOSING: 'CLOSING',
    CLOSED: 'CLOSED',
};

function normalizeState(raw: string): ConnectionState {
    const upper = raw.toUpperCase().replace(/-/g, '_');
    return STATE_MAP[upper] ?? 'ESTABLISHED';
}

interface AddressParts {
    address: string;
    port: number;
}

function parseAddressPort(raw: string): AddressParts {
    if (!raw || raw === '*:*' || raw === '0.0.0.0:0' || raw === '*') {
        return { address: '0.0.0.0', port: 0 };
    }

    const bracketMatch = raw.match(/^\[(.+)\]:(\d+)$/);
    if (bracketMatch) {
        return {
            address: bracketMatch[1] ?? '',
            port: parseInt(bracketMatch[2] ?? '0', 10) || 0,
        };
    }

    const lastColon = raw.lastIndexOf(':');
    if (lastColon === -1) {
        return { address: raw, port: 0 };
    }

    const address = raw.substring(0, lastColon);
    const port = parseInt(raw.substring(lastColon + 1), 10);

    return {
        address: address || '0.0.0.0',
        port: isNaN(port) ? 0 : port,
    };
}

function normalizeProtocol(raw: string): Protocol {
    const lower = raw.toLowerCase();
    if (lower.startsWith('udp')) return 'udp';
    return 'tcp';
}

interface NetstatEntry {
    protocol: string;
    localAddress: string;
    foreignAddress: string;
    state: string;
    pid: number;
    processName: string;
}

function isConnectionHeaderLine(line: string): boolean {
    const proto = (line.split(/\s+/)[0] ?? '').toLowerCase();
    return proto.startsWith('tcp') || proto.startsWith('udp');
}

function isStructuralLine(line: string): boolean {
    return line.startsWith('Active') || line.startsWith('Proto') || line.startsWith('---');
}

function parseNetstatOutput(stdout: string): NetworkConnection[] {
    const lines = stdout.split('\n');
    const connections: NetworkConnection[] = [];
    const entries: NetstatEntry[] = [];

    let i = 0;

    while (i < lines.length) {
        const line = lines[i]?.trim() ?? '';
        i++;

        if (!line) continue;
        if (isStructuralLine(line)) continue;

        const fields = line.split(/\s+/);
        if (fields.length < 4) continue;

        const proto = fields[0] ?? '';
        if (!proto.toLowerCase().startsWith('tcp') && !proto.toLowerCase().startsWith('udp')) continue;

        const localAddr = fields[1] ?? '';
        const foreignAddr = fields[2] ?? '';

        let state = '';
        let pidStr = '';

        if (proto.toLowerCase().startsWith('udp')) {
            state = '';
            pidStr = fields[3] ?? '0';
        } else {
            if (fields.length >= 5) {
                state = fields[3] ?? '';
                pidStr = fields[4] ?? '0';
            } else {
                state = fields[3] ?? '';
                pidStr = '0';
            }
        }

        const pid = parseInt(pidStr, 10) || 0;

        let processName = '';

        while (i < lines.length) {
            const continuation = lines[i]?.trim() ?? '';

            if (continuation === '' || isStructuralLine(continuation) || isConnectionHeaderLine(continuation)) {
                break;
            }

            const bracketMatch = continuation.match(/^\[(.+)\]$/);
            if (bracketMatch) {
                processName = bracketMatch[1] ?? '';
            }

            i++;
        }

        entries.push({
            protocol: proto,
            localAddress: localAddr,
            foreignAddress: foreignAddr,
            state,
            pid,
            processName,
        });
    }

    for (const entry of entries) {
        const protocol = normalizeProtocol(entry.protocol);
        const local = parseAddressPort(entry.localAddress);
        const remote = parseAddressPort(entry.foreignAddress);

        const connectionState: ConnectionState = entry.state
            ? normalizeState(entry.state)
            : (protocol === 'udp' ? 'ESTABLISHED' : 'ESTABLISHED');

        const id = generateConnectionId(
            protocol,
            local.address,
            local.port,
            remote.address,
            remote.port,
            entry.pid,
        );

        connections.push({
            id,
            protocol,
            localAddress: local.address,
            localPort: local.port,
            remoteAddress: remote.address,
            remotePort: remote.port,
            state: connectionState,
            processName: entry.processName || `PID:${entry.pid}`,
            processId: entry.pid,
            timestamp: Date.now(),
        });
    }

    return connections;
}

function parseNetstatAnoOutput(stdout: string): NetworkConnection[] {
    const lines = stdout.split('\n');
    const connections: NetworkConnection[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) continue;
        if (line.startsWith('Active') || line.startsWith('Proto')) continue;
        if (line.startsWith('---')) continue;

        const fields = line.split(/\s+/);
        if (fields.length < 4) continue;

        const proto = fields[0] ?? '';
        if (!proto.toLowerCase().startsWith('tcp') && !proto.toLowerCase().startsWith('udp')) continue;

        const localAddr = fields[1] ?? '';
        const foreignAddr = fields[2] ?? '';

        let state = '';
        let pidStr = '';

        if (proto.toLowerCase().startsWith('udp')) {
            pidStr = fields[3] ?? '0';
        } else {
            if (fields.length >= 5) {
                state = fields[3] ?? '';
                pidStr = fields[4] ?? '0';
            } else {
                state = fields[3] ?? '';
                pidStr = '0';
            }
        }

        const pid = parseInt(pidStr, 10) || 0;
        const protocol = normalizeProtocol(proto);
        const local = parseAddressPort(localAddr);
        const remote = parseAddressPort(foreignAddr);

        const connectionState: ConnectionState = state
            ? normalizeState(state)
            : 'ESTABLISHED';

        const id = generateConnectionId(
            protocol,
            local.address,
            local.port,
            remote.address,
            remote.port,
            pid,
        );

        connections.push({
            id,
            protocol,
            localAddress: local.address,
            localPort: local.port,
            remoteAddress: remote.address,
            remotePort: remote.port,
            state: connectionState,
            processName: `PID:${pid}`,
            processId: pid,
            timestamp: Date.now(),
        });
    }

    return connections;
}

function executeNetstat(): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            'netstat',
            ['-bno'],
            {
                timeout: COMMAND_TIMEOUT_MS,
                maxBuffer: 10 * 1024 * 1024,
                windowsHide: true,
            },
            (error, stdout, stderr) => {
                if (error) {
                    const code = (error as NodeJS.ErrnoException).code;

                    if (code === 'ENOENT') {
                        reject(new NetstatNotFoundError());
                        return;
                    }

                    if (code === 'EACCES' || code === 'EPERM') {
                        reject(new NetstatAccessDeniedError());
                        return;
                    }

                    if (error.killed) {
                        reject(new NetstatTimeoutError(COMMAND_TIMEOUT_MS));
                        return;
                    }

                    if (stdout && stdout.trim().length > 0) {
                        resolve(stdout);
                        return;
                    }

                    if (stderr && stderr.includes('requires elevation')) {
                        reject(new NetstatAccessDeniedError());
                        return;
                    }

                    reject(new NetstatExecutionError(error.message, stderr));
                    return;
                }

                resolve(stdout);
            },
        );
    });
}

function executeNetstatFallback(): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            'netstat',
            ['-ano'],
            {
                timeout: COMMAND_TIMEOUT_MS,
                maxBuffer: 10 * 1024 * 1024,
                windowsHide: true,
            },
            (error, stdout, stderr) => {
                if (error) {
                    const code = (error as NodeJS.ErrnoException).code;

                    if (code === 'ENOENT') {
                        reject(new NetstatNotFoundError());
                        return;
                    }

                    if (error.killed) {
                        reject(new NetstatTimeoutError(COMMAND_TIMEOUT_MS));
                        return;
                    }

                    if (stdout && stdout.trim().length > 0) {
                        resolve(stdout);
                        return;
                    }

                    reject(new NetstatExecutionError(error.message, stderr));
                    return;
                }

                resolve(stdout);
            },
        );
    });
}

export class NetstatNotFoundError extends Error {
    constructor() {
        super('netstat command not found. Ensure netstat is available on the system.');
        this.name = 'NetstatNotFoundError';
    }
}

export class NetstatAccessDeniedError extends Error {
    constructor() {
        super(
            'Access denied running netstat -b. The -b flag requires elevated privileges. ' +
            'Run the application as Administrator or it will fall back to -ano mode (without process names).',
        );
        this.name = 'NetstatAccessDeniedError';
    }
}

export class NetstatTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`netstat command timed out after ${timeoutMs}ms`);
        this.name = 'NetstatTimeoutError';
    }
}

export class NetstatExecutionError extends Error {
    readonly stderr: string;

    constructor(message: string, stderr: string) {
        super(`netstat execution failed: ${message}`);
        this.name = 'NetstatExecutionError';
        this.stderr = stderr;
    }
}

export class WindowsParser implements IConnectionParser {
    async parse(): Promise<NetworkConnection[]> {
        try {
            const stdout = await executeNetstat();
            return parseNetstatOutput(stdout);
        } catch (error) {
            if (error instanceof NetstatAccessDeniedError) {
                console.warn('[WindowsParser] -b flag requires elevation, falling back to -ano mode');
                return this.parseFallback();
            }

            if (
                error instanceof NetstatNotFoundError ||
                error instanceof NetstatTimeoutError
            ) {
                console.error(`[WindowsParser] ${(error as Error).name}: ${(error as Error).message}`);
                throw error;
            }

            console.error('[WindowsParser] Unexpected error during parse:', error);
            throw error;
        }
    }

    private async parseFallback(): Promise<NetworkConnection[]> {
        try {
            const stdout = await executeNetstatFallback();
            return parseNetstatAnoOutput(stdout);
        } catch (fallbackError) {
            console.error('[WindowsParser] Fallback -ano also failed:', fallbackError);
            throw fallbackError;
        }
    }

    getPlatform(): SupportedPlatform {
        return 'win32';
    }
}

export {
    parseNetstatOutput,
    parseNetstatAnoOutput,
    parseAddressPort,
    generateConnectionId,
    normalizeState,
    normalizeProtocol,
};

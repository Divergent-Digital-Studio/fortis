import { execFile } from 'node:child_process';
import type { NetworkConnection, ConnectionState, Protocol } from '@shared/types';
import type { SupportedPlatform } from '../platform';
import { getPlatformDefaults } from '../platform';
import { generateConnectionId } from '../connection-id';
import type { IConnectionParser } from './parser.interface';

const COMMAND_TIMEOUT_MS = 15_000;

const VALID_STATES: ReadonlySet<string> = new Set<ConnectionState>([
    'ESTABLISHED',
    'SYN_SENT',
    'SYN_RECV',
    'FIN_WAIT1',
    'FIN_WAIT2',
    'TIME_WAIT',
    'CLOSE_WAIT',
    'LAST_ACK',
    'LISTEN',
    'CLOSING',
    'CLOSED',
]);

function normalizeState(raw: string): ConnectionState {
    const upper = raw.toUpperCase().replace(/-/g, '_');

    if (VALID_STATES.has(upper)) {
        return upper as ConnectionState;
    }

    if (upper.startsWith('CLOSE_WAIT')) return 'CLOSE_WAIT';
    if (upper.startsWith('FIN_WAIT')) return 'FIN_WAIT1';

    return 'ESTABLISHED';
}

function normalizeProtocol(typeField: string, nodeField: string): Protocol {
    const lower = nodeField.toLowerCase();

    if (lower === 'udp') return 'udp';
    if (lower === 'tcp') return 'tcp';

    if (typeField === 'IPv4' || typeField === 'IPv6') {
        return lower.includes('udp') ? 'udp' : 'tcp';
    }

    return 'tcp';
}

interface AddressParts {
    address: string;
    port: number;
}

function parseAddressPort(raw: string): AddressParts {
    if (!raw || raw === '*' || raw === '*:*') {
        return { address: '0.0.0.0', port: 0 };
    }

    const bracketMatch = raw.match(/^\[(.+)\]:(\d+)$/);
    if (bracketMatch) {
        const addr = bracketMatch[1] ?? '';
        const portStr = bracketMatch[2] ?? '0';
        return {
            address: addr,
            port: parseInt(portStr, 10) || 0,
        };
    }

    const ipv6ColonCount = (raw.match(/:/g) || []).length;

    if (ipv6ColonCount > 1) {
        const lastColon = raw.lastIndexOf(':');
        const possiblePort = raw.substring(lastColon + 1);
        const possibleAddress = raw.substring(0, lastColon);

        if (/^\d+$/.test(possiblePort) && possibleAddress.includes(':')) {
            return {
                address: possibleAddress,
                port: parseInt(possiblePort, 10) || 0,
            };
        }

        return { address: raw, port: 0 };
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

interface ParsedLsofLine {
    command: string;
    pid: number;
    type: string;
    node: string;
    name: string;
}

// lsof escapes non-printable bytes in COMMAND as \xNN, so a space arrives as
// \x20. Left raw, every process name with a space reads as "Slack\x20Helper".
function decodeLsofEscapes(value: string): string {
    return value.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
    );
}

function tokenizeLsofLine(line: string): ParsedLsofLine | null {
    const fields = line.trim().split(/\s+/);

    if (fields.length < 9) return null;

    const command = decodeLsofEscapes(fields[0] ?? '');
    const pidStr = fields[1] ?? '';
    const type = fields[4] ?? '';
    const node = fields[7] ?? '';
    const name = fields.slice(8).join(' ');

    const pid = parseInt(pidStr, 10);

    if (!command || isNaN(pid) || !name) return null;

    return { command, pid, type, node, name };
}

function extractStateAndRemote(
    nameParts: string[],
    localRaw: string,
): { stateRaw: string; remoteRaw: string } {
    let stateRaw = '';
    let remoteRaw = '';

    if (nameParts.length > 1) {
        const rightSide = (nameParts[1] ?? '').trim();
        const parenMatch = rightSide.match(/^(.+?)\s*\((\w+)\)\s*$/);

        if (parenMatch) {
            remoteRaw = (parenMatch[1] ?? '').trim();
            stateRaw = parenMatch[2] ?? '';
        } else {
            remoteRaw = rightSide;
        }
    } else {
        const parenMatch = localRaw.match(/^(.+?)\s*\((\w+)\)\s*$/);
        if (parenMatch) {
            stateRaw = parenMatch[2] ?? '';
        }
    }

    return { stateRaw, remoteRaw };
}

function parseLsofOutput(stdout: string): NetworkConnection[] {
    const lines = stdout.split('\n');

    if (lines.length < 2) return [];

    const connections: NetworkConnection[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || !line.trim()) continue;

        const parsed = tokenizeLsofLine(line);
        if (!parsed) continue;

        if (parsed.type !== 'IPv4' && parsed.type !== 'IPv6') continue;
        if (parsed.node !== 'TCP' && parsed.node !== 'UDP') continue;

        const protocol = normalizeProtocol(parsed.type, parsed.node);
        const nameParts = parsed.name.split('->');
        const localRaw = (nameParts[0] ?? '').trim();

        const { stateRaw, remoteRaw } = extractStateAndRemote(nameParts, localRaw);

        const local = parseAddressPort(
            localRaw.replace(/\s*\(\w+\)\s*$/, ''),
        );
        const remote = remoteRaw
            ? parseAddressPort(remoteRaw)
            : { address: '0.0.0.0', port: 0 };

        const state: ConnectionState = stateRaw
            ? normalizeState(stateRaw)
            : 'ESTABLISHED';

        const id = generateConnectionId(
            protocol,
            local.address,
            local.port,
            remote.address,
            remote.port,
            parsed.pid,
        );

        connections.push({
            id,
            protocol,
            localAddress: local.address,
            localPort: local.port,
            remoteAddress: remote.address,
            remotePort: remote.port,
            state,
            processName: parsed.command,
            processId: parsed.pid,
            timestamp: Date.now(),
        });
    }

    return connections;
}


function executeLsof(): Promise<string> {
    const defaults = getPlatformDefaults();

    return new Promise((resolve, reject) => {
        console.log(`[MacParser] Executing: ${defaults.parserCommand} ${defaults.parserArgs.join(' ')}`);

        execFile(
            defaults.parserCommand,
            [...defaults.parserArgs],
            {
                timeout: COMMAND_TIMEOUT_MS,
                maxBuffer: 10 * 1024 * 1024,
                env: { ...process.env, LC_ALL: 'C' },
            },
            (error, stdout, stderr) => {
                if (stderr && stderr.trim().length > 0) {
                    console.warn(`[MacParser] stderr: ${stderr.substring(0, 500)}`);
                }

                if (error) {
                    const code = (error as NodeJS.ErrnoException).code;
                    console.error(`[MacParser] execFile error: code=${code}, message=${error.message}`);

                    if (code === 'ENOENT') {
                        reject(new LsofNotFoundError(defaults.parserCommand));
                        return;
                    }

                    if (code === 'EACCES' || code === 'EPERM') {
                        reject(new LsofPermissionError(defaults.parserCommand));
                        return;
                    }

                    if (error.killed) {
                        reject(new LsofTimeoutError(COMMAND_TIMEOUT_MS));
                        return;
                    }

                    if (stdout && stdout.trim().length > 0) {
                        console.log(`[MacParser] Error but got stdout (${stdout.length} bytes), using it`);
                        resolve(stdout);
                        return;
                    }

                    reject(new LsofExecutionError(error.message, stderr));
                    return;
                }

                const lineCount = stdout.split('\n').length;
                console.log(`[MacParser] lsof returned ${stdout.length} bytes, ${lineCount} lines`);

                resolve(stdout);
            },
        );
    });
}

export class LsofNotFoundError extends Error {
    constructor(command: string) {
        super(`Command not found: ${command}. Ensure lsof is installed.`);
        this.name = 'LsofNotFoundError';
    }
}

export class LsofPermissionError extends Error {
    constructor(command: string) {
        super(`Permission denied executing: ${command}. Run with appropriate privileges.`);
        this.name = 'LsofPermissionError';
    }
}

export class LsofTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`lsof command timed out after ${timeoutMs}ms`);
        this.name = 'LsofTimeoutError';
    }
}

export class LsofExecutionError extends Error {
    readonly stderr: string;

    constructor(message: string, stderr: string) {
        super(`lsof execution failed: ${message}`);
        this.name = 'LsofExecutionError';
        this.stderr = stderr;
    }
}

export class MacParser implements IConnectionParser {
    async parse(): Promise<NetworkConnection[]> {
        try {
            const stdout = await executeLsof();
            const connections = parseLsofOutput(stdout);
            console.log(`[MacParser] Parsed ${connections.length} network connections`);

            if (connections.length === 0 && stdout.trim().length > 0) {
                const lines = stdout.split('\n').filter((l: string) => l.trim());
                console.warn(`[MacParser] Got ${lines.length} lines but 0 connections parsed`);
                if (lines.length > 1) {
                    console.warn(`[MacParser] Header: ${lines[0]}`);
                    console.warn(`[MacParser] Sample line: ${lines[1]}`);
                }
            }

            return connections;
        } catch (error) {
            if (
                error instanceof LsofNotFoundError ||
                error instanceof LsofPermissionError ||
                error instanceof LsofTimeoutError
            ) {
                console.error(`[MacParser] ${error.name}: ${error.message}`);
                throw error;
            }

            console.error('[MacParser] Unexpected error during parse:', error);
            throw error;
        }
    }

    getPlatform(): SupportedPlatform {
        return 'darwin';
    }
}

export { parseLsofOutput, parseAddressPort, generateConnectionId, normalizeState, normalizeProtocol };

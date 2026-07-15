export interface ShellCommand {
    cmd: string;
    args: string[];
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

function assertIp(ip: string): void {
    if (!IPV4.test(ip) && !(ip.includes(':') && IPV6.test(ip))) {
        throw new Error(`[Defense] Invalid IP for firewall rule: ${ip}`);
    }
}

export function buildBlockCommand(platform: NodeJS.Platform, ip: string): ShellCommand {
    assertIp(ip);
    switch (platform) {
        case 'linux':
            return { cmd: 'ufw', args: ['insert', '1', 'deny', 'from', ip] };
        case 'darwin':
            return { cmd: 'pfctl', args: ['-t', 'fortis_blocklist', '-T', 'add', ip] };
        case 'win32':
            return {
                cmd: 'netsh',
                args: [
                    'advfirewall',
                    'firewall',
                    'add',
                    'rule',
                    `name=Fortis Block ${ip}`,
                    'dir=out',
                    'action=block',
                    `remoteip=${ip}`,
                ],
            };
        default:
            throw new Error(`[Defense] Unsupported platform for firewall: ${platform}`);
    }
}

export function buildUnblockCommand(platform: NodeJS.Platform, ip: string): ShellCommand {
    assertIp(ip);
    switch (platform) {
        case 'linux':
            return { cmd: 'ufw', args: ['delete', 'deny', 'from', ip] };
        case 'darwin':
            return { cmd: 'pfctl', args: ['-t', 'fortis_blocklist', '-T', 'delete', ip] };
        case 'win32':
            return {
                cmd: 'netsh',
                args: ['advfirewall', 'firewall', 'delete', 'rule', `name=Fortis Block ${ip}`],
            };
        default:
            throw new Error(`[Defense] Unsupported platform for firewall: ${platform}`);
    }
}

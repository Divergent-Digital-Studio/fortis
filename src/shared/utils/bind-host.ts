export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', '::1', 'localhost']);

/** Binds on every interface — reachable from the network. */
export const WILDCARD_HOSTS: ReadonlySet<string> = new Set(['0.0.0.0', '::']);

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function isIpv4(value: string): boolean {
    const match = IPV4.exec(value);
    if (!match) return false;
    // Reject leading zeros ("01.2.3.4"): they parse as octal in some resolvers.
    return match.slice(1).every((octet) => Number(octet) <= 255 && String(Number(octet)) === octet);
}

/** A hostname's final label may not be all digits — that shape is a malformed IP ("1.2.3"). */
function isHostname(value: string): boolean {
    if (!HOSTNAME.test(value)) return false;
    const labels = value.split('.');
    const last = labels[labels.length - 1] ?? '';
    return !/^\d+$/.test(last);
}

function isIpv6(value: string): boolean {
    if (value === '::') return true;
    if (!/^[0-9a-f:]+$/i.test(value)) return false;
    const doubleColons = value.split('::').length - 1;
    if (doubleColons > 1) return false;
    const groups = value.split(':').filter((g) => g.length > 0);
    if (groups.some((g) => g.length > 4)) return false;
    return doubleColons === 1 ? groups.length <= 7 : groups.length === 8;
}

/** A value usable as a WebSocket server bind address. */
export function isValidBindHost(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const host = value.trim();
    if (host.length === 0 || host.length > 253) return false;
    return isIpv4(host) || isIpv6(host) || isHostname(host);
}

/** True when the host exposes the server beyond this machine. */
export function isPubliclyBound(host: string): boolean {
    return !LOOPBACK_HOSTS.has(host.trim());
}

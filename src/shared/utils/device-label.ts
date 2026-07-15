import type { WifiDevice } from '../types/m1';

/** Router-issued suffixes that carry no meaning for a human reader. */
const NOISE_SUFFIXES = ['.modem', '.local', '.lan', '.home', '.localdomain', '.router'];

/**
 * Turn a router hostname into something readable: `Amirs-iPhone-16.modem`
 * becomes `Amirs iPhone 16`. Returns null when nothing legible remains, so
 * callers can fall through to the next-best source.
 */
export function prettifyHostname(hostname: string | null): string | null {
    if (!hostname) return null;

    let name = hostname.trim();
    const lower = name.toLowerCase();
    for (const suffix of NOISE_SUFFIXES) {
        if (lower.endsWith(suffix)) {
            name = name.slice(0, -suffix.length);
            break;
        }
    }

    name = name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (name.length === 0) return null;

    // A bare IP-derived name ("192-168-0-140") tells the user nothing.
    if (/^[\d\s]+$/.test(name)) return null;

    return name;
}

/**
 * Best guess at what a device is, in priority order: the name the user set, a
 * cleaned-up hostname, then the vendor (narrowed by IoT category when known).
 * Only falls back to the MAC when every source is empty.
 */
export function deviceLabel(device: WifiDevice): string {
    if (device.customName && device.customName.length > 0) return device.customName;

    const hostname = prettifyHostname(device.hostname);
    if (hostname) return hostname;

    if (device.vendor) {
        return device.iotCategory ? `${device.vendor} ${device.iotCategory}` : `${device.vendor} device`;
    }

    return `Unknown device (${device.mac})`;
}

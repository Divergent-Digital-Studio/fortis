export interface ArpEntry {
    ip: string
    mac: string
    hostname: string | null
}

const ZERO_MAC = /^(00:){5}00$/
// BSD/macOS `arp -a` drops leading zeros ("a0:b5:3c:37:8:4d"), so an octet may
// be one or two hex digits. Windows separates with dashes.
const MAC_RE = /^[0-9a-fA-F]{1,2}([:-][0-9a-fA-F]{1,2}){5}$/

/**
 * The low bit of the first octet is the IEEE group bit: set for multicast
 * (01:00:5e:…) and broadcast (ff:ff:…). No real host ever owns such an address.
 * Testing the MAC rather than the IP keeps this correct on any netmask — a host
 * at 10.0.1.255 on a /16 is perfectly normal.
 *
 * Not to be confused with bit 0x02, the locally-administered bit, which IS set
 * on the randomised MACs modern phones use.
 */
function isGroupMac(canonicalMac: string): boolean {
    const firstOctet = Number.parseInt(canonicalMac.slice(0, 2), 16)
    return Number.isInteger(firstOctet) && (firstOctet & 0x01) !== 0
}

function isUsableMac(mac: string): boolean {
    if (!mac) return false
    if (mac.toLowerCase().includes('incomplete')) return false
    if (!MAC_RE.test(mac)) return false
    const canonical = normalizeMac(mac)
    return !ZERO_MAC.test(canonical) && !isGroupMac(canonical)
}

/** Canonical `aa:bb:cc:dd:ee:ff` — zero-padded so OUI lookups match. */
export function normalizeMac(mac: string): string {
    return mac
        .split(/[:-]/)
        .map((octet) => octet.toLowerCase().padStart(2, '0'))
        .join(':')
}

/**
 * Addresses that are never a device on your LAN: anything that isn't IPv4
 * (Linux's `ip neigh` also lists IPv6), APIPA link-local (169.254/16), and the
 * multicast range (224+). Broadcast and multicast rows are already excluded by
 * their MAC, so no netmask assumption is needed here.
 */
export function isRealHostAddress(ip: string): boolean {
    const octets = ip.split('.')
    if (octets.length !== 4) return false
    for (const octet of octets) {
        if (!/^\d{1,3}$/.test(octet)) return false
        if (Number(octet) > 255) return false
    }
    if (ip.startsWith('169.254.')) return false
    if (ip.startsWith('0.')) return false
    return Number(octets[0]) < 224
}

/**
 * Normalise a raw hostname token from the ARP output. Returns null when the
 * entry had no resolvable name (BSD/macOS emits a literal "?" for these), so
 * downstream consumers can distinguish "no name" from a real name.
 */
function normalizeHostname(raw: string | undefined): string | null {
    if (raw === undefined) return null
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed === '?') return null
    return trimmed
}

export function parseArpMac(output: string): ArpEntry[] {
    const entries: ArpEntry[] = []
    // `arp -a` output: `hostname (1.2.3.4) at aa:bb:cc:dd:ee:ff on en0 ... [ethernet]`
    // The hostname token precedes the parenthesised IP and is "?" when unresolved.
    const lineRe = /^(\S+)\s+\(([\d.]+)\)\s+at\s+([0-9a-fA-F:]+|\(incomplete\))/

    for (const line of output.split('\n')) {
        const match = line.match(lineRe)
        if (!match) continue
        const hostname = normalizeHostname(match[1])
        const ip = match[2]
        const mac = match[3]
        if (ip === undefined || mac === undefined) continue
        if (!isUsableMac(mac) || !isRealHostAddress(ip)) continue
        entries.push({ ip, mac: normalizeMac(mac), hostname })
    }

    return entries
}

export function parseIpNeigh(output: string): ArpEntry[] {
    const entries: ArpEntry[] = []

    for (const line of output.split('\n')) {
        const parts = line.trim().split(/\s+/)
        const ip = parts[0]
        const lladdrIndex = parts.indexOf('lladdr')
        if (ip === undefined || lladdrIndex === -1) continue
        const mac = parts[lladdrIndex + 1]
        if (mac === undefined || !isUsableMac(mac) || !isRealHostAddress(ip)) continue
        entries.push({ ip, mac: normalizeMac(mac), hostname: null })
    }

    return entries
}

export function parseGetNetNeighbor(output: string): ArpEntry[] {
    const entries: ArpEntry[] = []

    for (const line of output.split('\n')) {
        const cells = line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim())
        if (cells.length < 3) continue
        const ip = cells[0]
        const mac = cells[1]
        const state = cells[2]
        if (ip === undefined || mac === undefined || state === undefined) continue
        if (state.toLowerCase() === 'unreachable') continue
        if (!isUsableMac(mac) || !isRealHostAddress(ip)) continue
        entries.push({ ip, mac: normalizeMac(mac), hostname: null })
    }

    return entries
}

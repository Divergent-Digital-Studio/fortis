export function ipv4ToUint(ip: string): number | null {
    const parts = ip.split('.')
    if (parts.length !== 4) return null
    let value = 0
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null
        const n = Number(part)
        if (n > 255) return null
        value = value * 256 + n
    }
    return value >>> 0
}

/*
 * `::ffff:8.8.8.8` is an IPv4 address wearing an IPv6 costume; kernels hand these out
 * on dual-stack sockets. Unwrap so it geolocates via the IPv4 table.
 */
export function unwrapIpv4Mapped(ip: string): string {
    const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
    return match ? match[1]! : ip
}

/*
 * IPv6 keys are the top 64 bits only. DB-IP allocates at /64 or coarser (0.01% of its
 * ranges subdivide further), and a full 128-bit key would double the dataset for that.
 * Returns null for anything that is not a well-formed IPv6 literal.
 */
export function ipv6ToPrefix(ip: string): bigint | null {
    const zone = ip.indexOf('%')
    const address = zone === -1 ? ip : ip.slice(0, zone)
    if (address.length === 0 || !address.includes(':')) return null

    const halves = address.split('::')
    if (halves.length > 2) return null

    const parse = (part: string): string[] | null => {
        if (part === '') return []
        const groups = part.split(':')
        for (const group of groups) {
            if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
        }
        return groups
    }

    const head = parse(halves[0] ?? '')
    const tail = halves.length === 2 ? parse(halves[1] ?? '') : []
    if (head === null || tail === null) return null

    let groups: string[]
    if (halves.length === 2) {
        const fill = 8 - head.length - tail.length
        if (fill < 1) return null
        groups = [...head, ...Array<string>(fill).fill('0'), ...tail]
    } else {
        groups = head
    }
    if (groups.length !== 8) return null

    /* Only the first four groups form the key; the rest is the interface identifier. */
    let value = 0n
    for (let i = 0; i < 4; i += 1) {
        value = (value << 16n) | BigInt(parseInt(groups[i]!, 16))
    }
    return value
}

export function isPrivateOrReservedIpv6(ip: string): boolean {
    const prefix = ipv6ToPrefix(ip)
    if (prefix === null) return true

    const top16 = prefix >> 48n

    /* Unspecified (::) and loopback (::1) both sit in the all-zero top 64 bits. */
    if (prefix === 0n) return true
    /* fe80::/10 link-local, fec0::/10 site-local (deprecated). */
    if ((top16 & 0xffc0n) === 0xfe80n || (top16 & 0xffc0n) === 0xfec0n) return true
    /* fc00::/7 unique local. */
    if ((top16 & 0xfe00n) === 0xfc00n) return true
    /* ff00::/8 multicast. */
    if ((top16 & 0xff00n) === 0xff00n) return true
    /* 2001:db8::/32 documentation. */
    if (prefix >> 32n === 0x20010db8n) return true

    return false
}

export function isPrivateOrReservedIp(ip: string): boolean {
    const address = unwrapIpv4Mapped(ip)
    return address.includes(':')
        ? isPrivateOrReservedIpv6(address)
        : isPrivateOrReservedIpv4(address)
}

export function isPrivateOrReservedIpv4(ip: string): boolean {
    const value = ipv4ToUint(ip)
    if (value === null) return true

    const inRange = (start: string, end: string): boolean => {
        const s = ipv4ToUint(start)
        const e = ipv4ToUint(end)
        if (s === null || e === null) return false
        return value >= s && value <= e
    }

    return (
        inRange('0.0.0.0', '0.255.255.255') ||
        inRange('10.0.0.0', '10.255.255.255') ||
        inRange('100.64.0.0', '100.127.255.255') ||
        inRange('127.0.0.0', '127.255.255.255') ||
        inRange('169.254.0.0', '169.254.255.255') ||
        inRange('172.16.0.0', '172.31.255.255') ||
        inRange('192.0.0.0', '192.0.0.255') ||
        inRange('192.168.0.0', '192.168.255.255') ||
        inRange('198.18.0.0', '198.19.255.255') ||
        inRange('224.0.0.0', '239.255.255.255') ||
        inRange('240.0.0.0', '255.255.255.255')
    )
}

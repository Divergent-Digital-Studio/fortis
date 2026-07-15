interface WhitelistMatchEntry {
    processName?: string | undefined
    remoteAddress?: string | undefined
    remotePort?: number | undefined
}

interface WhitelistQuery {
    processName?: string | undefined
    remoteAddress?: string | undefined
    remotePort?: number | undefined
}

function parseIPv4(address: string): number | null {
    const parts = address.split('.')
    if (parts.length !== 4) return null

    let result = 0
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null
        const octet = Number(part)
        if (octet > 255) return null
        result = result * 256 + octet
    }

    return result >>> 0
}

function isCidr(value: string): boolean {
    return value.includes('/')
}

function matchesCidr(query: string, cidr: string): boolean {
    const slash = cidr.indexOf('/')
    const base = cidr.slice(0, slash)
    const prefixRaw = cidr.slice(slash + 1)

    if (!/^\d{1,2}$/.test(prefixRaw)) return false
    const prefix = Number(prefixRaw)
    if (prefix > 32) return false

    const baseInt = parseIPv4(base)
    const queryInt = parseIPv4(query)
    if (baseInt === null || queryInt === null) return false

    if (prefix === 0) return true

    const mask = (0xffffffff << (32 - prefix)) >>> 0
    return (baseInt & mask) === (queryInt & mask)
}

function matchesAddress(entryAddress: string, queryAddress: string): boolean {
    if (isCidr(entryAddress)) {
        return matchesCidr(queryAddress, entryAddress)
    }
    return entryAddress === queryAddress
}

function matchesProcess(entryProcess: string, queryProcess: string): boolean {
    return entryProcess.toLowerCase() === queryProcess.toLowerCase()
}

function whitelistEntryMatches(entry: WhitelistMatchEntry, query: WhitelistQuery): boolean {
    const hasProcessRule = entry.processName !== undefined && entry.processName !== null
    const hasAddressRule = entry.remoteAddress !== undefined && entry.remoteAddress !== null
    const hasPortRule = entry.remotePort !== undefined && entry.remotePort !== null

    if (!hasProcessRule && !hasAddressRule && !hasPortRule) return false

    if (hasProcessRule) {
        if (query.processName === undefined) return false
        if (!matchesProcess(entry.processName as string, query.processName)) return false
    }

    if (hasAddressRule) {
        if (query.remoteAddress === undefined) return false
        if (!matchesAddress(entry.remoteAddress as string, query.remoteAddress)) return false
    }

    if (hasPortRule) {
        if (query.remotePort === undefined) return false
        if (entry.remotePort !== query.remotePort) return false
    }

    return true
}

function isWhitelistedBy(entries: WhitelistMatchEntry[], query: WhitelistQuery): boolean {
    if (query.processName === undefined && query.remoteAddress === undefined && query.remotePort === undefined) {
        return false
    }

    for (const entry of entries) {
        if (whitelistEntryMatches(entry, query)) return true
    }

    return false
}

export { whitelistEntryMatches, isWhitelistedBy, matchesCidr, parseIPv4 }
export type { WhitelistMatchEntry, WhitelistQuery }

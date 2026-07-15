export type OuiMap = Record<string, string>

export function normalizeMac(mac: string): string | null {
    const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
    if (hex.length < 12) return null
    return hex.slice(0, 12)
}

export function lookupVendor(map: OuiMap, mac: string): string | null {
    const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
    if (hex.length < 6) return null
    return map[hex.slice(0, 6)] ?? null
}

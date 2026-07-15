export interface DnsCacheEntry {
    domain: string
    resolvedIp: string
}

function splitCsvLine(line: string): string[] {
    const cells: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i]
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"'
                i += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }
        if (char === ',' && !inQuotes) {
            cells.push(current)
            current = ''
            continue
        }
        current += char
    }
    cells.push(current)
    return cells.map((cell) => cell.trim())
}

function isIpAddress(value: string): boolean {
    if (/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(value)) return true
    if (/^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/.test(value) && value.includes(':')) return true
    return false
}

export function parseWindowsDnsCache(output: string): DnsCacheEntry[] {
    const entries: DnsCacheEntry[] = []
    const lines = output.split('\n').map((line) => line.replace(/\r$/, ''))

    let headerCells: string[] | null = null
    let recordNameIndex = -1
    let recordTypeIndex = -1
    let dataIndex = -1

    for (const line of lines) {
        if (line.trim().length === 0) continue
        const cells = splitCsvLine(line)

        if (headerCells === null) {
            headerCells = cells.map((cell) => cell.toLowerCase())
            recordNameIndex = headerCells.indexOf('recordname')
            recordTypeIndex = headerCells.indexOf('recordtype')
            dataIndex = headerCells.indexOf('data')
            continue
        }

        if (recordNameIndex === -1 || recordTypeIndex === -1 || dataIndex === -1) continue

        const domain = cells[recordNameIndex]
        const recordType = cells[recordTypeIndex]
        const data = cells[dataIndex]
        if (domain === undefined || recordType === undefined || data === undefined) continue

        const normalizedType = recordType.toUpperCase()
        if (normalizedType !== 'A' && normalizedType !== 'AAAA') continue
        if (domain.length === 0) continue
        if (data.length === 0 || !isIpAddress(data)) continue

        entries.push({ domain, resolvedIp: data })
    }

    return entries
}

export function parseDscacheutil(output: string): DnsCacheEntry[] {
    const entries: DnsCacheEntry[] = []
    let currentName: string | null = null

    for (const rawLine of output.split('\n')) {
        const line = rawLine.trim()
        if (line.length === 0) {
            currentName = null
            continue
        }

        const separator = line.indexOf(':')
        if (separator === -1) continue

        const key = line.slice(0, separator).trim().toLowerCase()
        const value = line.slice(separator + 1).trim()

        if (key === 'name') {
            currentName = value.length > 0 ? value : null
            continue
        }

        if (key === 'ip_address') {
            if (currentName !== null && value.length > 0 && isIpAddress(value)) {
                entries.push({ domain: currentName, resolvedIp: value })
            }
        }
    }

    return entries
}

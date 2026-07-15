import type { ReportProcessStat, ReportDestinationStat } from '../../../shared/types/m2'

interface RollupConnection {
    processName: string
    remoteAddress: string
}

interface RollupInput {
    connections: RollupConnection[]
    threatCount: number
    newDeviceCount: number
    healthScore: number | null
    countryOf: (address: string) => string | null
}

interface Rollup {
    topProcesses: ReportProcessStat[]
    topDestinations: ReportDestinationStat[]
    threatCount: number
    newDeviceCount: number
    healthScore: number | null
}

const TOP_N = 10

function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
    const counts = new Map<string, number>()
    for (const item of items) {
        const key = keyOf(item)
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
}

export function buildRollup(input: RollupInput): Rollup {
    const processCounts = countBy(input.connections, (c) => c.processName)
    const destinationCounts = countBy(input.connections, (c) => c.remoteAddress)

    const topProcesses: ReportProcessStat[] = [...processCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_N)

    const topDestinations: ReportDestinationStat[] = [...destinationCounts.entries()]
        .map(([address, count]) => ({ address, country: input.countryOf(address), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_N)

    return {
        topProcesses,
        topDestinations,
        threatCount: input.threatCount,
        newDeviceCount: input.newDeviceCount,
        healthScore: input.healthScore,
    }
}

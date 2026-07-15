export interface Baseline {
    knownDestinations: Set<string>
    typicalHourStart: number
    typicalHourEnd: number
    avgBytesPerWindow: number
}

export interface BehaviorWindow {
    processName: string
    destinations: string[]
    hour: number
    bytes: number
}

export interface BehaviorScore {
    score: number
    factors: string[]
}

export function scoreBehavior(baseline: Baseline, window: BehaviorWindow): BehaviorScore {
    const factors: string[] = []
    let score = 0

    const newDests = window.destinations.filter((d) => !baseline.knownDestinations.has(d))
    if (newDests.length > 0) {
        const contribution = Math.min(40, newDests.length * 15)
        score += contribution
        factors.push(`${newDests.length} new destination(s)`)
    }

    const offHours = window.hour < baseline.typicalHourStart || window.hour >= baseline.typicalHourEnd
    if (offHours) {
        score += 25
        factors.push('off-hours activity')
    }

    if (baseline.avgBytesPerWindow > 0 && window.bytes > baseline.avgBytesPerWindow * 5) {
        score += 35
        factors.push('data-egress spike')
    }

    return { score: Math.min(100, score), factors }
}

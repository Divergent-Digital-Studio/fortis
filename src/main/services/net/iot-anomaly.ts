export interface IotAnomalyResult {
    isAnomaly: boolean
    newCountries: string[]
}

export function detectNewCountryAnomaly(
    baseline: Set<string>,
    currentCountryCodes: string[],
): IotAnomalyResult {
    if (baseline.size === 0) {
        return { isAnomaly: false, newCountries: [] }
    }

    const newCountries: string[] = []
    const seen = new Set<string>()

    for (const code of currentCountryCodes) {
        if (baseline.has(code)) continue
        if (seen.has(code)) continue
        seen.add(code)
        newCountries.push(code)
    }

    return { isAnomaly: newCountries.length > 0, newCountries }
}

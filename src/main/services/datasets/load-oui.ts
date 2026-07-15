import { readFileSync } from 'node:fs'

export function loadOuiMap(path: string): { map: Record<string, string>; available: boolean } {
    try {
        const raw = readFileSync(path, 'utf8')
        const parsed = JSON.parse(raw) as Record<string, string>
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            console.warn('[Datasets] OUI map is not an object, degrading to empty map')
            return { map: {}, available: false }
        }
        return { map: parsed, available: true }
    } catch (err) {
        console.warn(`[Datasets] failed to load OUI map from ${path}:`, err)
        return { map: {}, available: false }
    }
}

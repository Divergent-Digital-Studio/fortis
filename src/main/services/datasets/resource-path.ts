import { join } from 'node:path'
import { existsSync } from 'node:fs'

export function resolveDatasetPath(
    resourcesPath: string | undefined,
    devRoot: string,
    file: string,
): string {
    if (resourcesPath) {
        return join(resourcesPath, 'datasets', file)
    }
    return join(devRoot, 'resources', 'datasets', file)
}

export function findDatasetPath(
    resourcesPath: string | undefined,
    devRoots: string[],
    file: string,
): string {
    const candidates: string[] = []
    if (resourcesPath) {
        candidates.push(join(resourcesPath, 'datasets', file))
    }
    for (const root of devRoots) {
        candidates.push(join(root, 'resources', 'datasets', file))
    }

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate
    }

    return candidates[candidates.length - 1] ?? join('resources', 'datasets', file)
}

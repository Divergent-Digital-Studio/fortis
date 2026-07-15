import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { resolveDatasetPath } from './resource-path'

describe('resolveDatasetPath', () => {
    it('resolves under resourcesPath when packaged', () => {
        expect(resolveDatasetPath('/app/resources', '/repo', 'oui-map.json')).toBe(
            join('/app/resources', 'datasets', 'oui-map.json'),
        )
    })

    it('resolves under devRoot resources when resourcesPath is undefined', () => {
        expect(resolveDatasetPath(undefined, '/repo', 'oui-map.json')).toBe(
            join('/repo', 'resources', 'datasets', 'oui-map.json'),
        )
    })

    it('treats an empty resourcesPath as dev', () => {
        expect(resolveDatasetPath('', '/repo', 'ip-city.bin')).toBe(
            join('/repo', 'resources', 'datasets', 'ip-city.bin'),
        )
    })
})

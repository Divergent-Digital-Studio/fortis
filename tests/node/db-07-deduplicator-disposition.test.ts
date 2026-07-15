import { describe, it, expect } from 'vitest'
import { AlertDeduplicator } from '@main/services/alert-deduplicator'

const conn = {
    ruleId: 'suspicious-port',
    processName: 'curl',
    remoteAddress: '93.184.216.1',
    remotePort: 4444,
}

describe('DB-07 AlertDeduplicator namespaces keys by disposition', () => {
    it('learning + alert of the same connection do not collide', () => {
        const dedup = new AlertDeduplicator()
        try {
            const learningKey = dedup.generateDedupKey({ disposition: 'learning', ...conn })
            const alertKey = dedup.generateDedupKey({ ...conn })
            expect(learningKey).not.toBe(alertKey)
        } finally {
            dedup.dispose()
        }
    })

    it('silent + alert of the same connection do not collide', () => {
        const dedup = new AlertDeduplicator()
        try {
            const silentKey = dedup.generateDedupKey({ disposition: 'silent', ...conn })
            const alertKey = dedup.generateDedupKey({ disposition: 'alert', ...conn })
            expect(silentKey).not.toBe(alertKey)
        } finally {
            dedup.dispose()
        }
    })

    it('default (no disposition) equals explicit alert disposition', () => {
        const dedup = new AlertDeduplicator()
        try {
            expect(dedup.generateDedupKey({ ...conn })).toBe(
                dedup.generateDedupKey({ disposition: 'alert', ...conn }),
            )
        } finally {
            dedup.dispose()
        }
    })
})

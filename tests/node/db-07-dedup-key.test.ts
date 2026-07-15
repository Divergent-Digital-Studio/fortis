import { describe, it, expect } from 'vitest'
import { buildDedupKey } from '@main/services/db/dedup-key'

const conn = {
    ruleId: 'suspicious-port',
    processName: 'curl',
    remoteAddress: '93.184.216.1',
    remotePort: 4444,
}

describe('DB-07 disposition-namespaced dedup keys', () => {
    it('alert / silent / learning of the SAME connection produce distinct keys', () => {
        const alertKey = buildDedupKey({ disposition: 'alert', ...conn })
        const silentKey = buildDedupKey({ disposition: 'silent', ...conn })
        const learningKey = buildDedupKey({ disposition: 'learning', ...conn })

        expect(alertKey).not.toBe(silentKey)
        expect(alertKey).not.toBe(learningKey)
        expect(silentKey).not.toBe(learningKey)
    })

    it('learning log cannot collide with an active-alert key for the same rule+conn', () => {
        const learningKey = buildDedupKey({ disposition: 'learning', ...conn })
        const alertKey = buildDedupKey({ disposition: 'alert', ...conn })
        expect(learningKey).not.toBe(alertKey)
    })

    it('default disposition is alert (back-compat for real-alert path)', () => {
        expect(buildDedupKey(conn)).toBe(buildDedupKey({ disposition: 'alert', ...conn }))
    })

    it('same disposition + same connection is deterministic', () => {
        expect(buildDedupKey({ disposition: 'alert', ...conn })).toBe(
            buildDedupKey({ disposition: 'alert', ...conn }),
        )
    })

    it('different connections within the same disposition differ', () => {
        const a = buildDedupKey({ disposition: 'alert', ...conn })
        const b = buildDedupKey({ disposition: 'alert', ...conn, remotePort: 8080 })
        expect(a).not.toBe(b)
    })
})

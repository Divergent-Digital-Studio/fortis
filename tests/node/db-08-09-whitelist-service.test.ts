import { describe, it, expect } from 'vitest'
import { WhitelistService } from '@main/services/whitelist'
import type { IDatabaseService } from '@main/services/database'
import type { FortisEventBus } from '@main/services/event-bus'
import type { WhitelistEntry } from '@shared/types/whitelist'

function fakeEventBus(): FortisEventBus {
    return { emit: () => {}, on: () => {}, off: () => {} } as unknown as FortisEventBus
}

function fakeDb(rows: WhitelistEntry[]): IDatabaseService {
    return {
        getWhitelist: () => rows,
        addWhitelistEntry: () => 'id',
        removeWhitelistEntry: () => true,
    } as unknown as IDatabaseService
}

function entry(partial: Partial<WhitelistEntry>): WhitelistEntry {
    return { id: partial.id ?? 'e', reason: 'r', source: 'user', createdAt: 0, ...partial }
}

describe('DB-08 whitelist service does not over-match narrow entries', () => {
    it('a process+address pinned entry is NOT matched by a process-only query', () => {
        const svc = new WhitelistService(fakeDb([entry({ processName: 'curl', remoteAddress: '1.2.3.4' })]), fakeEventBus())
        expect(svc.isWhitelisted('curl')).toBe(false)
    })

    it('the same entry matches when both fields are supplied', () => {
        const svc = new WhitelistService(fakeDb([entry({ processName: 'curl', remoteAddress: '1.2.3.4' })]), fakeEventBus())
        expect(svc.isWhitelisted('curl', '1.2.3.4')).toBe(true)
    })
})

describe('DB-09 whitelist service CIDR + case-insensitive', () => {
    it('matches in-range CIDR and rejects out-of-range', () => {
        const svc = new WhitelistService(fakeDb([entry({ remoteAddress: '10.0.0.0/24' })]), fakeEventBus())
        expect(svc.isWhitelisted(undefined, '10.0.0.42')).toBe(true)
        expect(svc.isWhitelisted(undefined, '10.0.1.42')).toBe(false)
    })

    it('matches process names case-insensitively', () => {
        const svc = new WhitelistService(fakeDb([entry({ processName: 'Chrome' })]), fakeEventBus())
        expect(svc.isWhitelisted('chrome')).toBe(true)
    })

    it('malformed CIDR does not throw and does not match', () => {
        const svc = new WhitelistService(fakeDb([entry({ remoteAddress: '10.0.0.0/99' })]), fakeEventBus())
        expect(() => svc.isWhitelisted(undefined, '10.0.0.5')).not.toThrow()
        expect(svc.isWhitelisted(undefined, '10.0.0.5')).toBe(false)
    })
})

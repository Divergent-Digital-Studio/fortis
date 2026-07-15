import { describe, it, expect } from 'vitest'
import { parseLsofOutput, generateConnectionId as macGenerateId } from '@main/utils/parsers/mac-parser'
import { generateConnectionId as winGenerateId } from '@main/utils/parsers/win-parser'
import { generateConnectionId as linuxGenerateId } from '@main/utils/parsers/linux-parser'

const LSOF_FIXTURE = [
    'COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
    'Spotify  1234  user   42u  IPv4 0xabc123      0t0  TCP 192.168.1.10:54321->35.186.224.25:443 (ESTABLISHED)',
].join('\n')

describe('BE-03 stable macOS connection id', () => {
    it('produces an identical id for the same connection across two parses', () => {
        const first = parseLsofOutput(LSOF_FIXTURE)
        const second = parseLsofOutput(LSOF_FIXTURE)

        expect(first).toHaveLength(1)
        expect(second).toHaveLength(1)
        expect(first[0]!.id).toBe(second[0]!.id)
    })

    it('does not embed an incrementing counter suffix in the id', () => {
        const conns = parseLsofOutput(LSOF_FIXTURE)
        expect(conns[0]!.id).not.toMatch(/#\d+$/)
    })

    it('generates an identical id across mac/win/linux parsers for the same tuple', () => {
        const args = ['tcp' as const, '192.168.1.10', 54321, '35.186.224.25', 443, 1234] as const
        const macId = macGenerateId(...args)
        const winId = winGenerateId(...args)
        const linuxId = linuxGenerateId(...args)

        expect(macId).toBe(winId)
        expect(winId).toBe(linuxId)
        expect(macId).toBe('tcp:192.168.1.10:54321->35.186.224.25:443@1234')
    })
})

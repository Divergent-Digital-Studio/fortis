import { describe, it, expect } from 'vitest'
import { parseWindowsDnsCache, parseDscacheutil } from './dns-cache-parse'

describe('parseWindowsDnsCache (Get-DnsClientCache CSV)', () => {
    it('keeps A records with a valid IP', () => {
        const out =
            '"Entry","RecordName","RecordType","Data"\n' +
            '"example.com","example.com","A","93.184.216.34"\n'
        expect(parseWindowsDnsCache(out)).toEqual([
            { domain: 'example.com', resolvedIp: '93.184.216.34' },
        ])
    })

    it('keeps AAAA records with an IPv6 address', () => {
        const out =
            '"Entry","RecordName","RecordType","Data"\n' +
            '"ipv6.example.com","ipv6.example.com","AAAA","2606:2800:220:1:248:1893:25c8:1946"\n'
        expect(parseWindowsDnsCache(out)).toEqual([
            { domain: 'ipv6.example.com', resolvedIp: '2606:2800:220:1:248:1893:25c8:1946' },
        ])
    })

    it('skips non A/AAAA rows and rows with empty data', () => {
        const out =
            '"Entry","RecordName","RecordType","Data"\n' +
            '"_sip._tcp.example.com","_sip._tcp.example.com","SRV","0 5 5060 sip.example.com"\n' +
            '"empty.example.com","empty.example.com","A",""\n' +
            '"good.example.com","good.example.com","A","1.2.3.4"\n'
        expect(parseWindowsDnsCache(out)).toEqual([
            { domain: 'good.example.com', resolvedIp: '1.2.3.4' },
        ])
    })
})

describe('parseDscacheutil (macOS dscacheutil host blocks)', () => {
    it('pairs each name with its ip_address', () => {
        const out =
            'name: example.com\n' +
            'ip_address: 93.184.216.34\n' +
            '\n' +
            'name: cdn.example.net\n' +
            'ip_address: 203.0.113.10\n'
        expect(parseDscacheutil(out)).toEqual([
            { domain: 'example.com', resolvedIp: '93.184.216.34' },
            { domain: 'cdn.example.net', resolvedIp: '203.0.113.10' },
        ])
    })

    it('ignores ip_address with no preceding name', () => {
        const out = 'ip_address: 10.0.0.1\n'
        expect(parseDscacheutil(out)).toEqual([])
    })
})

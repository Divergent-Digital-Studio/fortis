import { describe, it, expect } from 'vitest'
import { parseArpMac, parseIpNeigh, parseGetNetNeighbor } from './arp-parse'

describe('parseArpMac (macOS/BSD `arp -a`)', () => {
    it('extracts ip + mac + hostname, skipping incomplete entries', () => {
        const out =
            '? (192.168.1.1) at a4:b1:c2:11:22:33 on en0 ifscope [ethernet]\n' +
            '? (192.168.1.5) at (incomplete) on en0 ifscope [ethernet]\n'
        expect(parseArpMac(out)).toEqual([{ ip: '192.168.1.1', mac: 'a4:b1:c2:11:22:33', hostname: null }])
    })

    it('captures a resolved hostname when present', () => {
        const out = 'living-room-speaker.local (192.168.1.42) at a4:b1:c2:11:22:33 on en0 ifscope [ethernet]\n'
        expect(parseArpMac(out)).toEqual([
            { ip: '192.168.1.42', mac: 'a4:b1:c2:11:22:33', hostname: 'living-room-speaker.local' },
        ])
    })

    it('skips the all-zero MAC', () => {
        const out = '? (192.168.1.9) at 00:00:00:00:00:00 on en0 ifscope [ethernet]\n'
        expect(parseArpMac(out)).toEqual([])
    })

    it('zero-pads octets that arp printed without a leading zero', () => {
        // Real `arp -a` output: the router's MAC has two short octets.
        const out = '? (192.168.0.1) at a0:b5:3c:37:8:4d on en0 ifscope [ethernet]\n'
        expect(parseArpMac(out)).toEqual([{ ip: '192.168.0.1', mac: 'a0:b5:3c:37:08:4d', hostname: null }])
    })

    it('still rejects the all-zero MAC written in short form', () => {
        expect(parseArpMac('? (192.168.1.9) at 0:0:0:0:0:0 on en0 [ethernet]\n')).toEqual([])
    })

    it('drops link-local, multicast and broadcast rows', () => {
        const out =
            '? (169.254.31.20) at c8:69:cd:84:c5:37 on en0 [ethernet]\n' +
            '? (224.0.0.251) at 1:0:5e:0:0:fb on en0 [ethernet]\n' +
            '? (239.255.255.250) at 1:0:5e:7f:ff:fa on en0 [ethernet]\n' +
            '? (192.168.0.255) at ff:ff:ff:ff:ff:ff on en0 [ethernet]\n' +
            '? (192.168.0.69) at d4:90:9c:d2:2f:e7 on en0 [ethernet]\n'
        expect(parseArpMac(out)).toEqual([
            { ip: '192.168.0.69', mac: 'd4:90:9c:d2:2f:e7', hostname: null },
        ])
    })

    it('keeps a host whose address merely ends in .255 on a wider subnet', () => {
        // On a /16, 10.0.1.255 is an ordinary host, not the broadcast address.
        const out = '? (10.0.1.255) at d4:90:9c:d2:2f:e7 on en0 [ethernet]\n'
        expect(parseArpMac(out)).toEqual([{ ip: '10.0.1.255', mac: 'd4:90:9c:d2:2f:e7', hostname: null }])
    })

    it('keeps a phone using a randomised (locally-administered) MAC', () => {
        // 0x02 is the locally-administered bit, not the multicast bit.
        const out = '? (192.168.0.79) at f6:85:d0:89:1d:86 on en0 [ethernet]\n'
        expect(parseArpMac(out)).toEqual([{ ip: '192.168.0.79', mac: 'f6:85:d0:89:1d:86', hostname: null }])
    })
})

describe('cross-platform neighbour tables', () => {
    it('parses real `ip neigh` output, skipping IPv6 and stale-without-lladdr rows', () => {
        const out = [
            '192.168.0.1 dev wlan0 lladdr a0:b5:3c:37:8:4d REACHABLE',
            '192.168.0.140 dev wlan0 lladdr 58:66:6d:64:c6:45 STALE',
            '192.168.0.44 dev wlan0  FAILED',
            'fe80::1 dev wlan0 lladdr a0:b5:3c:37:08:4d router REACHABLE',
            '224.0.0.251 dev wlan0 lladdr 01:00:5e:00:00:fb PERMANENT',
        ].join('\n')
        expect(parseIpNeigh(out)).toEqual([
            { ip: '192.168.0.1', mac: 'a0:b5:3c:37:08:4d', hostname: null },
            { ip: '192.168.0.140', mac: '58:66:6d:64:c6:45', hostname: null },
        ])
    })

    it('parses Windows CSV, skipping unreachable, broadcast and multicast', () => {
        const out =
            '"192.168.0.69","D4-90-9C-D2-2F-E7","Reachable"\n' +
            '"192.168.0.44","A4-B1-C2-11-22-33","Unreachable"\n' +
            '"192.168.0.255","FF-FF-FF-FF-FF-FF","Permanent"\n' +
            '"224.0.0.251","01-00-5E-00-00-FB","Permanent"\n'
        expect(parseGetNetNeighbor(out)).toEqual([
            { ip: '192.168.0.69', mac: 'd4:90:9c:d2:2f:e7', hostname: null },
        ])
    })

    it('normalises every platform to the same canonical MAC', () => {
        const mac = 'd4:90:9c:d2:2f:e7'
        expect(parseArpMac('? (10.0.0.2) at d4:90:9c:d2:2f:e7 on en0 [ethernet]\n')[0]!.mac).toBe(mac)
        expect(parseIpNeigh('10.0.0.2 dev eth0 lladdr d4:90:9c:d2:2f:e7 REACHABLE')[0]!.mac).toBe(mac)
        expect(parseGetNetNeighbor('"10.0.0.2","D4-90-9C-D2-2F-E7","Reachable"\n')[0]!.mac).toBe(mac)
    })
})

describe('parseIpNeigh (linux `ip neigh`)', () => {
    it('extracts reachable/stale entries with lladdr', () => {
        const out =
            '192.168.1.1 dev wlan0 lladdr a4:b1:c2:11:22:33 REACHABLE\n' +
            '192.168.1.9 dev wlan0 FAILED\n'
        expect(parseIpNeigh(out)).toEqual([{ ip: '192.168.1.1', mac: 'a4:b1:c2:11:22:33', hostname: null }])
    })
})

describe('parseGetNetNeighbor (windows CSV)', () => {
    it('parses ip,mac CSV rows, skipping unreachable', () => {
        const out =
            '"192.168.1.1","a4-b1-c2-11-22-33","Reachable"\n' +
            '"192.168.1.2","00-00-00-00-00-00","Unreachable"\n'
        expect(parseGetNetNeighbor(out)).toEqual([{ ip: '192.168.1.1', mac: 'a4:b1:c2:11:22:33', hostname: null }])
    })
})

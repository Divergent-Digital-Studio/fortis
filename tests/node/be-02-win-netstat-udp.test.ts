import { describe, it, expect, vi, beforeEach } from 'vitest'

type ExecFileCallback = (
    error: NodeJS.ErrnoException | null,
    stdout: string,
    stderr: string,
) => void

const execFileMock = vi.fn()

vi.mock('node:child_process', () => ({
    execFile: (
        _command: string,
        _args: readonly string[],
        _options: unknown,
        callback: ExecFileCallback,
    ) => execFileMock(_command, _args, _options, callback),
}))

const NETSTAT_B_WITH_UDP = [
    'Active Connections',
    '',
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    192.168.1.5:51000      140.82.113.25:443      ESTABLISHED     4321',
    ' [chrome.exe]',
    '  UDP    192.168.1.5:5353       *:*                                    1500',
    ' [mDNSResponder.exe]',
].join('\n')

const NETSTAT_ANO_WITH_UDP = [
    'Active Connections',
    '',
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    192.168.1.5:51000      140.82.113.25:443      ESTABLISHED     4321',
    '  UDP    192.168.1.5:5353       *:*                                    1500',
].join('\n')

describe('BE-02 Windows netstat captures UDP', () => {
    beforeEach(() => {
        execFileMock.mockReset()
    })

    it('does not pass a TCP-only protocol filter to netstat', async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(null, NETSTAT_B_WITH_UDP, '')
        })

        const { WindowsParser } = await import('@main/utils/parsers/win-parser')
        await new WindowsParser().parse()

        expect(execFileMock).toHaveBeenCalled()
        const args = execFileMock.mock.calls[0]![1] as readonly string[]
        expect(args).not.toContain('TCP')
    })

    it('parseNetstatOutput yields a udp connection from a UDP row', async () => {
        const { parseNetstatOutput } = await import('@main/utils/parsers/win-parser')
        const conns = parseNetstatOutput(NETSTAT_B_WITH_UDP)
        const udp = conns.filter((c) => c.protocol === 'udp')
        expect(udp.length).toBeGreaterThanOrEqual(1)
        expect(udp[0]!.localPort).toBe(5353)
    })

    it('parseNetstatAnoOutput yields a udp connection from a UDP row', async () => {
        const { parseNetstatAnoOutput } = await import('@main/utils/parsers/win-parser')
        const conns = parseNetstatAnoOutput(NETSTAT_ANO_WITH_UDP)
        const udp = conns.filter((c) => c.protocol === 'udp')
        expect(udp.length).toBeGreaterThanOrEqual(1)
        expect(udp[0]!.processId).toBe(1500)
    })
})

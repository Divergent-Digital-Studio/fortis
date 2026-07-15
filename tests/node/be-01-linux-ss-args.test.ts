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

const ESTABLISHED_OUTBOUND_SS = [
    'Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port  Process',
    'tcp   ESTAB  0      0      192.168.1.20:52344  35.190.247.13:443  users:(("firefox",pid=4821,fd=88))',
].join('\n')

describe('BE-01 Linux ss captures established/outbound connections', () => {
    beforeEach(() => {
        execFileMock.mockReset()
    })

    it('does not pass the -l listening-only flag and requests all sockets', async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(null, ESTABLISHED_OUTBOUND_SS, '')
        })

        const { LinuxParser } = await import('@main/utils/parsers/linux-parser')
        await new LinuxParser().parse()

        expect(execFileMock).toHaveBeenCalled()
        const args = execFileMock.mock.calls[0]![1] as readonly string[]
        const flags = args.join('')
        expect(flags).not.toContain('l')
        expect(flags).toContain('a')
    })

    it('parses an ESTABLISHED outbound row keeping the real remote address', async () => {
        const { parseSsOutput } = await import('@main/utils/parsers/linux-parser')
        const conns = parseSsOutput(ESTABLISHED_OUTBOUND_SS)

        expect(conns).toHaveLength(1)
        const conn = conns[0]!
        expect(conn.state).toBe('ESTABLISHED')
        expect(conn.remoteAddress).toBe('35.190.247.13')
        expect(conn.remotePort).toBe(443)
        expect(conn.localAddress).toBe('192.168.1.20')
        expect(conn.processName).toBe('firefox')
    })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

type ExecFileCallback = (
    error: NodeJS.ErrnoException | null,
    stdout: string,
    stderr: string,
) => void

const execFileMock = vi.fn()
const networkConnectionsMock = vi.fn()

vi.mock('node:child_process', () => ({
    execFile: (
        _command: string,
        _args: readonly string[],
        _options: unknown,
        callback: ExecFileCallback,
    ) => execFileMock(_command, _args, _options, callback),
}))

vi.mock('systeminformation', () => ({
    default: { networkConnections: networkConnectionsMock },
    networkConnections: networkConnectionsMock,
}))

vi.mock('@main/utils/platform', async (importActual) => {
    const actual = await importActual<typeof import('@main/utils/platform')>()
    return { ...actual, getPlatform: () => 'darwin' as const }
})

const LSOF_OK = [
    'COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
    'curl     2200  user   5u   IPv4 0xdef        0t0  TCP 10.0.0.3:60000->8.8.8.8:443 (ESTABLISHED)',
].join('\n')

function notFoundError(): NodeJS.ErrnoException {
    const err = new Error('spawn ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    return err
}

describe('BE-04 WorkerOffloadParser threads source metadata and surfaces failures', () => {
    beforeEach(() => {
        execFileMock.mockReset()
        networkConnectionsMock.mockReset()
    })

    it('reports primary source when the platform parser succeeds (inline fallback path)', async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(null, LSOF_OK, '')
        })

        const { WorkerOffloadParser } = await import('@main/utils/parsers/worker-offload-parser')
        const parser = new WorkerOffloadParser()
        const conns = await parser.parse()

        expect(conns.length).toBeGreaterThanOrEqual(1)
        const meta = parser.getLastParseMeta()
        expect(meta).not.toBeNull()
        expect(meta!.source).toBe('primary')
    })

    it('reports fallback source when the platform parser rejects but systeminformation works', async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(notFoundError(), '', '')
        })
        networkConnectionsMock.mockResolvedValue([
            {
                protocol: 'udp',
                localAddress: '10.0.0.3',
                localPort: '5353',
                peerAddress: '0.0.0.0',
                peerPort: '0',
                state: '',
                pid: 9,
                process: 'mdns',
            },
        ])

        const { WorkerOffloadParser } = await import('@main/utils/parsers/worker-offload-parser')
        const parser = new WorkerOffloadParser()
        const conns = await parser.parse()

        expect(conns).toHaveLength(1)
        expect(parser.getLastParseMeta()!.source).toBe('fallback')
    })

    it('still flags fallback source even when the fallback yields no connections', async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(notFoundError(), '', '')
        })
        networkConnectionsMock.mockRejectedValue(new Error('si down'))

        const { WorkerOffloadParser } = await import('@main/utils/parsers/worker-offload-parser')
        const parser = new WorkerOffloadParser()
        const conns = await parser.parse()

        expect(conns).toEqual([])
        expect(parser.getLastParseMeta()!.source).toBe('fallback')
    })
})

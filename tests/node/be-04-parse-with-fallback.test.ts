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

function notFoundError(): NodeJS.ErrnoException {
    const err = new Error('spawn ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    return err
}

describe('BE-04 parseWithFallback engages systeminformation when primary throws', () => {
    beforeEach(() => {
        execFileMock.mockReset()
        networkConnectionsMock.mockReset()
    })

    it("returns source:'fallback' with fallback connections when the primary parser rejects", async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(notFoundError(), '', '')
        })
        networkConnectionsMock.mockResolvedValue([
            {
                protocol: 'tcp',
                localAddress: '10.0.0.9',
                localPort: '8443',
                peerAddress: '1.1.1.1',
                peerPort: '443',
                state: 'ESTABLISHED',
                pid: 77,
                process: 'node',
            },
        ])

        const { PlatformParserFactory } = await import('@main/utils/parsers/parser-factory')
        const result = await PlatformParserFactory.parseWithFallback('darwin')

        expect(result.source).toBe('fallback')
        expect(result.parser).toBe('systeminformation')
        expect(result.connections).toHaveLength(1)
        expect(result.connections[0]!.remoteAddress).toBe('1.1.1.1')
    })
})

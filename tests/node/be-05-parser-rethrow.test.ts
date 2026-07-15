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

function notFoundError(): NodeJS.ErrnoException {
    const err = new Error('spawn ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    return err
}

describe('BE-05 parsers reject on terminal command failure', () => {
    beforeEach(() => {
        execFileMock.mockReset()
    })

    it('MacParser.parse rejects when lsof is not found', async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(notFoundError(), '', '')
        })
        const { MacParser } = await import('@main/utils/parsers/mac-parser')
        await expect(new MacParser().parse()).rejects.toThrow()
    })

    it('WindowsParser.parse rejects when netstat is not found', async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(notFoundError(), '', '')
        })
        const { WindowsParser } = await import('@main/utils/parsers/win-parser')
        await expect(new WindowsParser().parse()).rejects.toThrow()
    })

    it('LinuxParser.parse rejects when ss is not found', async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb: ExecFileCallback) => {
            cb(notFoundError(), '', '')
        })
        const { LinuxParser } = await import('@main/utils/parsers/linux-parser')
        await expect(new LinuxParser().parse()).rejects.toThrow()
    })
})

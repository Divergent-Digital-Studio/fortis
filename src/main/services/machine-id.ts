import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { hostname, platform, arch } from 'os'

function getMachineIdentifier(): string {
    const currentPlatform = platform()

    try {
        if (currentPlatform === 'darwin') {
            const output = execSync(
                'ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID',
                { encoding: 'utf8', timeout: 5000 },
            )
            const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
            if (match?.[1]) return match[1]
        }

        if (currentPlatform === 'linux') {
            const output = execSync('cat /etc/machine-id', {
                encoding: 'utf8',
                timeout: 5000,
            })
            const trimmed = output.trim()
            if (trimmed.length > 0) return trimmed
        }

        if (currentPlatform === 'win32') {
            const output = execSync(
                'wmic csproduct get UUID',
                { encoding: 'utf8', timeout: 5000 },
            )
            const lines = output.split('\n').filter((l) => l.trim().length > 0)
            const uuid = lines[1]?.trim()
            if (uuid && uuid !== 'UUID') return uuid
        }
    } catch {
        // fallback below
    }

    return `${hostname()}-${currentPlatform}-${arch()}`
}

let cachedId: string | null = null

function machineIdSync(): string {
    if (!cachedId) {
        const raw = getMachineIdentifier()
        cachedId = createHash('sha256').update(raw).digest('hex')
    }
    return cachedId
}

export { machineIdSync }

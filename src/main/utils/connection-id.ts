import type { Protocol } from '@shared/types';

export function generateConnectionId(
    protocol: Protocol,
    localAddress: string,
    localPort: number,
    remoteAddress: string,
    remotePort: number,
    processId: number,
): string {
    return `${protocol}:${localAddress}:${localPort}->${remoteAddress}:${remotePort}@${processId}`;
}

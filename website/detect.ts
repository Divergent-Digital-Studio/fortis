export type OsKind = 'mac' | 'win' | 'linux';
export type ArchKind = 'x64' | 'arm64';

export interface DetectedPlatform {
    os: OsKind;
    arch: ArchKind;
}

export function detectPlatform(userAgent: string, platformHint: string): DetectedPlatform {
    const ua = userAgent.toLowerCase();
    const hint = platformHint.toLowerCase();
    if (ua.includes('windows') || hint.startsWith('win')) {
        return { os: 'win', arch: 'x64' };
    }
    if (ua.includes('linux') && !ua.includes('android')) {
        return { os: 'linux', arch: 'x64' };
    }
    if (ua.includes('mac') || hint.includes('mac')) {
        const arm = ua.includes('arm64') || ua.includes('aarch64');
        return { os: 'mac', arch: arm ? 'arm64' : 'x64' };
    }
    return { os: 'mac', arch: 'x64' };
}

export function downloadAssetName(platform: DetectedPlatform, version: string): string {
    switch (platform.os) {
        case 'mac':
            return platform.arch === 'arm64'
                ? `Fortis-${version}-arm64.dmg`
                : `Fortis-${version}.dmg`;
        case 'win':
            return `Fortis-${version}-setup.exe`;
        case 'linux':
            return `Fortis-${version}.AppImage`;
    }
}

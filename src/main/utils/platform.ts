export type SupportedPlatform = 'darwin' | 'win32' | 'linux';

const SUPPORTED_PLATFORMS: ReadonlySet<string> = new Set<SupportedPlatform>([
    'darwin',
    'win32',
    'linux',
]);

export class UnsupportedPlatformError extends Error {
    readonly platform: string;

    constructor(platform: string) {
        super(`Unsupported platform: ${platform}`);
        this.name = 'UnsupportedPlatformError';
        this.platform = platform;
    }
}

export interface PlatformDefaults {
    parserCommand: string;
    parserArgs: readonly string[];
    defaultConfigPath: string;
    iconFormat: 'icns' | 'ico' | 'png';
    supportsAutoStart: boolean;
    pathSeparator: '/' | '\\';
}

const PLATFORM_DEFAULTS: Record<SupportedPlatform, PlatformDefaults> = {
    darwin: {
        parserCommand: 'lsof',
        parserArgs: ['-i', '-P', '-n'] as const,
        defaultConfigPath: '~/Library/Application Support/Fortis',
        iconFormat: 'icns',
        supportsAutoStart: true,
        pathSeparator: '/',
    },
    win32: {
        parserCommand: 'netstat',
        parserArgs: ['-ano'] as const,
        defaultConfigPath: '%APPDATA%\\Fortis',
        iconFormat: 'ico',
        supportsAutoStart: true,
        pathSeparator: '\\',
    },
    linux: {
        parserCommand: 'ss',
        parserArgs: ['-tuanp'] as const,
        defaultConfigPath: '~/.config/fortis',
        iconFormat: 'png',
        supportsAutoStart: true,
        pathSeparator: '/',
    },
};

export function getPlatform(): SupportedPlatform {
    const platform = process.platform;

    if (!SUPPORTED_PLATFORMS.has(platform)) {
        throw new UnsupportedPlatformError(platform);
    }

    return platform as SupportedPlatform;
}

export function isSupported(): boolean {
    return SUPPORTED_PLATFORMS.has(process.platform);
}

export function getPlatformDefaults(): PlatformDefaults {
    const platform = getPlatform();
    return PLATFORM_DEFAULTS[platform];
}

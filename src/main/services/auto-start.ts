import { app } from 'electron'

type SupportedPlatform = 'darwin' | 'win32' | 'linux'

const SUPPORTED_PLATFORMS: ReadonlySet<string> = new Set<SupportedPlatform>([
    'darwin',
    'win32',
    'linux',
])

function isSupportedPlatform(): boolean {
    return SUPPORTED_PLATFORMS.has(process.platform)
}

function isPackagedApp(): boolean {
    return app.isPackaged
}

function applyAutoStart(enabled: boolean): void {
    if (!isPackagedApp()) return

    try {
        if (process.platform === 'darwin' || process.platform === 'win32') {
            app.setLoginItemSettings({ openAtLogin: enabled })
        }
    } catch {
        // Silently fail — unsigned apps on macOS cannot set login items
    }
}

function getAutoStartStatus(): boolean {
    if (!isPackagedApp()) return false

    if (process.platform === 'darwin' || process.platform === 'win32') {
        const settings = app.getLoginItemSettings()
        return settings.openAtLogin
    }

    return false
}

function initAutoStart(autoStartEnabled: boolean): void {
    if (!isSupportedPlatform()) return

    applyAutoStart(autoStartEnabled)
}

function handleAutoStartSettingChange(autoStartEnabled: boolean): void {
    if (!isSupportedPlatform()) return

    applyAutoStart(autoStartEnabled)
}

export { initAutoStart, handleAutoStartSettingChange, getAutoStartStatus, isSupportedPlatform }

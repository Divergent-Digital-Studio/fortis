import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import { join } from 'path'

type TrayState = 'active' | 'paused'

let tray: Tray | null = null
let currentState: TrayState = 'active'
let connectionCount = 0
let getMainWindow: (() => BrowserWindow | null) | null = null

const ICON_DIR = join(__dirname, '../../resources/tray')

function resolveIconPath(state: TrayState): string {
    return join(ICON_DIR, `tray-${state}Template.png`)
}

function loadTrayIcon(state: TrayState): Electron.NativeImage {
    const iconPath = resolveIconPath(state)
    const icon = nativeImage.createFromPath(iconPath)

    if (process.platform === 'darwin') {
        icon.setTemplateImage(true)
    }

    return icon
}

function buildTooltip(): string {
    if (currentState === 'paused') {
        return 'Fortis — Paused'
    }
    return `Fortis — Monitoring Active (${connectionCount} connection${connectionCount !== 1 ? 's' : ''})`
}

function toggleDashboard(): void {
    const mainWindow = getMainWindow?.()
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (mainWindow.isVisible()) {
        mainWindow.hide()
        if (process.platform === 'darwin') {
            app.dock?.hide()
        }
    } else {
        mainWindow.show()
        mainWindow.focus()
        if (process.platform === 'darwin') {
            app.dock?.show()
        }
    }

    refreshContextMenu()
}

function buildContextMenu(): Menu {
    const mainWindow = getMainWindow?.()
    const isWindowVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()

    const statusLabel = currentState === 'active'
        ? `● Monitoring Active — ${connectionCount} connection${connectionCount !== 1 ? 's' : ''}`
        : '○ Monitoring Paused'

    return Menu.buildFromTemplate([
        {
            label: statusLabel,
            enabled: false,
        },
        { type: 'separator' },
        {
            label: isWindowVisible ? 'Hide Dashboard' : 'Show Dashboard',
            click: toggleDashboard,
        },
        {
            label: 'Scan Now',
            enabled: false,
        },
        { type: 'separator' },
        {
            label: currentState === 'active' ? 'Pause Monitoring' : 'Resume Monitoring',
            click: () => {
                const nextState: TrayState = currentState === 'active' ? 'paused' : 'active'
                updateTrayState(nextState)
                trayEventHandlers.onPauseToggle?.(nextState)
            },
        },
        { type: 'separator' },
        {
            label: 'Settings',
            click: () => {
                const win = getMainWindow?.()
                if (win && !win.isDestroyed()) {
                    win.show()
                    win.focus()
                    if (process.platform === 'darwin') {
                        app.dock?.show()
                    }
                }
                trayEventHandlers.onSettingsClick?.()
            },
        },
        {
            label: 'Quit Fortis',
            click: () => {
                app.quit()
            },
        },
    ])
}

export function refreshContextMenu(): void {
    if (!tray) return
    tray.setContextMenu(buildContextMenu())
}

const trayEventHandlers: {
    onPauseToggle?: (state: TrayState) => void
    onSettingsClick?: () => void
} = {}

export function initTray(windowGetter: () => BrowserWindow | null): Tray {
    if (tray) return tray

    getMainWindow = windowGetter

    const icon = loadTrayIcon(currentState)
    tray = new Tray(icon)
    tray.setToolTip('Fortis — Starting...')

    tray.on('click', () => {
        toggleDashboard()
    })

    if (process.platform === 'win32') {
        tray.on('double-click', () => {
            const mainWindow = getMainWindow?.()
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show()
                mainWindow.focus()
            }
        })
    }

    refreshContextMenu()
    tray.setToolTip(buildTooltip())

    return tray
}

export function updateTrayState(state: TrayState): void {
    currentState = state

    if (!tray) return

    const icon = loadTrayIcon(state)
    tray.setImage(icon)
    tray.setToolTip(buildTooltip())
    refreshContextMenu()
}

export function updateConnectionCount(count: number): void {
    connectionCount = count

    if (!tray) return

    tray.setToolTip(buildTooltip())
    refreshContextMenu()
}

export function onPauseToggle(handler: (state: TrayState) => void): void {
    trayEventHandlers.onPauseToggle = handler
}

export function onSettingsClick(handler: () => void): void {
    trayEventHandlers.onSettingsClick = handler
}

export function destroyTray(): void {
    if (tray) {
        tray.destroy()
        tray = null
    }
}

export function getTray(): Tray | null {
    return tray
}

export type { TrayState }

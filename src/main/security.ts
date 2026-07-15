import { app, session } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'

function buildCSP(): string {
    const isDev = !app.isPackaged

    const directives = [
        "default-src 'self'",
        isDev
            ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
            : "script-src 'self'",
        isDev
            ? "style-src 'self' 'unsafe-inline'"
            : "style-src 'self'",
        "style-src-attr 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        isDev
            ? "connect-src 'self' ws://localhost:* http://localhost:*"
            : "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]

    return directives.join('; ')
}

function configureCSP(): void {
    const csp = buildCSP()

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp],
            },
        })
    })
}

function assertSecuritySettings(options: BrowserWindowConstructorOptions): void {
    const webPrefs = options.webPreferences

    if (!webPrefs) {
        throw new Error('BrowserWindow must have webPreferences defined')
    }

    const violations: string[] = []

    if (webPrefs.contextIsolation !== true) {
        violations.push('contextIsolation must be true')
    }

    if (webPrefs.nodeIntegration !== false) {
        violations.push('nodeIntegration must be false')
    }

    if (webPrefs.sandbox !== true) {
        violations.push('sandbox must be true')
    }

    if (webPrefs.webSecurity !== true) {
        violations.push('webSecurity must be true')
    }

    if (violations.length > 0) {
        const msg = `Security violations detected:\n${violations.join('\n')}`
        throw new Error(msg)
    }
}

function disableWebviewAndExternalNavigation(): void {
    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-attach-webview', (event) => {
            event.preventDefault()
        })

        contents.on('will-navigate', (event, navigationUrl) => {
            const parsedUrl = new URL(navigationUrl)
            const allowedProtocols = ['file:', 'devtools:']

            if (app.isPackaged) {
                if (!allowedProtocols.includes(parsedUrl.protocol)) {
                    event.preventDefault()
                }
            } else {
                const devProtocols = [...allowedProtocols, 'http:', 'https:']
                if (!devProtocols.includes(parsedUrl.protocol)) {
                    event.preventDefault()
                }

                if (
                    parsedUrl.protocol === 'http:' &&
                    parsedUrl.hostname !== 'localhost' &&
                    parsedUrl.hostname !== '127.0.0.1'
                ) {
                    event.preventDefault()
                }
            }
        })

        contents.setWindowOpenHandler(() => {
            return { action: 'deny' }
        })
    })
}

function applySecurityHardening(): void {
    configureCSP()
    disableWebviewAndExternalNavigation()
}

export { applySecurityHardening, assertSecuritySettings, buildCSP, configureCSP, disableWebviewAndExternalNavigation }

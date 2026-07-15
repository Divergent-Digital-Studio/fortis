import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'

process.on('uncaughtException', (error) => {
    console.error('[Main] Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
    console.error('[Main] Unhandled promise rejection:', reason)
})
import { initTray, destroyTray, onPauseToggle, onSettingsClick, refreshContextMenu } from './tray'
import { registerAllHandlers, updateSettings, injectServices, updateCachedConnections, wireRendererBridges, pushNewAlert, getCachedConnections } from './ipc-handlers'
import { initAutoStart } from './services/auto-start'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { eventBus } from './services/event-bus'
import { DatabaseService } from './services/database'
import { ScanScheduler } from './services/scan-scheduler'
import { NetworkMonitor } from './services/network-monitor'
import { EventPipeline } from './services/event-pipeline'
import { MemoryWatchdog } from './services/memory-watchdog'
import { WorkerOffloadParser } from './utils/parsers'
import type { IConnectionParser } from './utils/parsers'
import { applySecurityHardening, assertSecuritySettings } from './security'
import { configureEncryption } from './services/encryption'
import { getDbKey, getEncryptionConfig } from './services/db-key'
import { AIAnalyzerService } from './services/ai-analyzer'
import { AICache } from './utils/ai-cache'
import { OpenAIProvider } from './services/providers/openai-provider'
import { AnthropicProvider } from './services/providers/anthropic-provider'
import { OllamaProvider } from './services/providers/ollama-provider'
import { SmartTriggerService } from './services/smart-trigger'
import { NotificationService } from './services/notification'
import { SensitivityTuner } from './services/sensitivity-tuner'
import { ConfidenceScorer } from './services/confidence-scorer'
import { initializeSalt, generateSalt } from './utils/anonymizer'
import { WhitelistService } from './services/whitelist'
import { ConnectionBatchQueue } from './services/connection-batch-queue'
import { LearningPeriodService } from './services/learning-period'
import { TierGatingService } from './services/tier-gating'
import { SelfMonitorService } from './services/self-monitor'
import { DeviceDiscoverer } from './services/device-discoverer'
import { DnsCollector } from './services/dns-collector'
import { VpnLeakDetector } from './services/vpn-leak-detector'
import { GeoLocator } from './services/geo-locator'
import { IotMonitor } from './services/iot-monitor'
import { loadOuiMap } from './services/datasets/load-oui'
import { loadGeoip } from './services/datasets/load-geoip'
import { findDatasetPath } from './services/datasets/resource-path'
import { computeM1RetentionCutoff, computeReportRetentionCutoff } from './services/db/retention'
import { ReportGenerator } from './services/report-generator'
import { ReportPdfExporter } from './services/reports/report-pdf'
import { shouldGenerateReport } from './services/reports/report-schedule'
import { FlowLocator } from './services/flow-locator'
import { RuleEngine } from './services/rule-engine'
import { DefenseService } from './services/defense-service'
import { CertMonitor } from './services/cert-monitor'
import { BandwidthMonitor } from './services/bandwidth-monitor'
import { WebhookDispatcher } from './services/webhook-dispatcher'
import { createBandwidthSource } from './services/bandwidth/bandwidth-source'
import { EMPTY_BANDWIDTH_SNAPSHOT } from '@shared/types/m3'
import type { IAIProvider, AIProviderType } from '@shared/types/analysis'
import electronUpdater from 'electron-updater'
import { UpdateService } from './services/update-service'
import type { UpdaterSeam } from './services/update-service'
import { RemoteServer } from './services/remote-server'
import { PagerDutyDispatcher } from './services/pagerduty-dispatcher'
import { SessionService } from './services/session-service'
import { RestApiServer } from './services/rest-api-server'
import { SiemDispatcher } from './services/siem-dispatcher'
import { ThreatIntelDispatcher } from './services/threat-intel-dispatcher'
import { ComplianceService } from './services/compliance-service'
import { InsiderThreatService } from './services/insider-threat-service'

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let pipeline: EventPipeline | null = null
let monitor: NetworkMonitor | null = null
let database: DatabaseService | null = null
let memoryWatchdog: MemoryWatchdog | null = null
let aiAnalyzer: AIAnalyzerService | null = null
let aiCache: AICache | null = null
let smartTrigger: SmartTriggerService | null = null
let notificationService: NotificationService | null = null
let sensitivityTuner: SensitivityTuner | null = null
let whitelistService: WhitelistService | null = null
let learningPeriodService: LearningPeriodService | null = null
let batchQueue: ConnectionBatchQueue | null = null
let tierGating: TierGatingService | null = null
let selfMonitor: SelfMonitorService | null = null
let deviceDiscoverer: DeviceDiscoverer | null = null
let dnsCollector: DnsCollector | null = null
let vpnLeakDetector: VpnLeakDetector | null = null
let geoLocator: GeoLocator | null = null
let iotMonitor: IotMonitor | null = null
let m1PruneTimer: ReturnType<typeof setInterval> | null = null
let reportGenerator: ReportGenerator | null = null
let flowLocator: FlowLocator | null = null
let ruleEngine: RuleEngine | null = null
let certMonitor: CertMonitor | null = null
let bandwidthMonitor: BandwidthMonitor | null = null
let webhookDispatcher: WebhookDispatcher | null = null
let updateService: UpdateService | null = null
let remoteServer: RemoteServer | null = null
let pagerDutyDispatcher: PagerDutyDispatcher | null = null
let sessionService: SessionService | null = null
let restApiServer: RestApiServer | null = null
let siemDispatcher: SiemDispatcher | null = null
let threatIntelDispatcher: ThreatIntelDispatcher | null = null
let complianceService: ComplianceService | null = null
let insiderThreatService: InsiderThreatService | null = null
let reportGenerationInFlight = false
let monitoringActive = false

const M1_PRUNE_INTERVAL_MS = 60 * 60 * 1000
const INSIDER_BASELINE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function pruneM1History(): void {
    if (!database || !tierGating) return
    try {
        const limits = tierGating.getTierLimits()
        const cutoff = computeM1RetentionCutoff(limits, Date.now())
        if (cutoff !== null) {
            database.pruneM1History(cutoff)
        }
        const reportCutoff = computeReportRetentionCutoff(limits, Date.now())
        if (reportCutoff !== null) {
            database.pruneReports(reportCutoff)
            database.pruneDefenseActions(reportCutoff)
            database.pruneTlsCerts(reportCutoff)
        }
        database.pruneInsiderBaselines(Date.now() - INSIDER_BASELINE_RETENTION_MS)
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`[Main] M1 history prune failed: ${reason}`)
    }
}

function maybeGenerateWeeklyReport(): void {
    if (!database || !reportGenerator || reportGenerationInFlight) return
    if (!monitoringActive) return
    try {
        const latest = database.getLatestReport()
        if (!shouldGenerateReport(latest?.generatedAt ?? null, Date.now())) return
        reportGenerationInFlight = true
        reportGenerator
            .generate()
            .catch((error: unknown) => {
                const reason = error instanceof Error ? error.message : String(error)
                console.warn(`[Main] Weekly report generation failed: ${reason}`)
            })
            .finally(() => {
                reportGenerationInFlight = false
            })
    } catch (error) {
        reportGenerationInFlight = false
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`[Main] Weekly report scheduling failed: ${reason}`)
    }
}

function periodicMaintenance(): void {
    pruneM1History()
    maybeGenerateWeeklyReport()
}

const DEFAULT_WIDTH = 1200
const DEFAULT_HEIGHT = 800
const MIN_WIDTH = 900
const MIN_HEIGHT = 600

function getWindowBounds(): Electron.Rectangle | undefined {
    try {
        const stored = global.__fortisSettings?.windowBounds
        if (!stored) return undefined

        const { x, y, width, height } = stored
        const displays = screen.getAllDisplays()
        const isVisible = displays.some((display) => {
            const { bounds } = display
            return (
                x >= bounds.x &&
                y >= bounds.y &&
                x + width <= bounds.x + bounds.width &&
                y + height <= bounds.y + bounds.height
            )
        })

        if (!isVisible) return undefined

        return {
            x,
            y,
            width: Math.max(width, MIN_WIDTH),
            height: Math.max(height, MIN_HEIGHT),
        }
    } catch {
        return undefined
    }
}

function saveWindowBounds(): void {
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
        const bounds = mainWindow.getBounds()
        global.__fortisSettings = {
            ...global.__fortisSettings,
            windowBounds: bounds,
        }
        global.__fortisSettingsChanged?.('windowBounds', bounds)
    } catch {
        // noop
    }
}

function createMainWindow(): BrowserWindow {
    const savedBounds = getWindowBounds()

    const windowOptions: Electron.BrowserWindowConstructorOptions = {
        width: savedBounds?.width ?? DEFAULT_WIDTH,
        height: savedBounds?.height ?? DEFAULT_HEIGHT,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        show: false,
        frame: true,
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#0a0a0f',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            preload: join(__dirname, '../preload/index.js'),
        },
    }

    if (savedBounds?.x !== undefined && savedBounds?.y !== undefined) {
        windowOptions.x = savedBounds.x
        windowOptions.y = savedBounds.y
    }

    assertSecuritySettings(windowOptions)
    mainWindow = new BrowserWindow(windowOptions)

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
        if (process.platform === 'darwin') {
            app.dock?.show()
        }
    })

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault()
            mainWindow?.hide()

            if (process.platform === 'darwin') {
                app.dock?.hide()
            }

            refreshContextMenu()
        }
    })

    let boundsTimeout: ReturnType<typeof setTimeout> | null = null

    const debouncedSaveBounds = (): void => {
        if (boundsTimeout) clearTimeout(boundsTimeout)
        boundsTimeout = setTimeout(saveWindowBounds, 500)
    }

    mainWindow.on('resize', debouncedSaveBounds)
    mainWindow.on('move', debouncedSaveBounds)

    mainWindow.on('closed', () => {
        mainWindow = null
    })

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return mainWindow
}

function showMainWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createMainWindow()
        refreshContextMenu()
        return
    }

    mainWindow.show()
    mainWindow.focus()

    if (process.platform === 'darwin') {
        app.dock?.show()
    }

    refreshContextMenu()
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
    app.quit()
} else {
    registerAllHandlers()

    app.on('second-instance', () => {
        showMainWindow()
    })

    app.on('before-quit', () => {
        isQuitting = true
        if (m1PruneTimer) {
            clearInterval(m1PruneTimer)
            m1PruneTimer = null
        }
        ruleEngine?.stop()
        certMonitor?.stop()
        bandwidthMonitor?.stop()
        webhookDispatcher?.stop()
        remoteServer?.stop()
        pagerDutyDispatcher?.stop()
        restApiServer?.stop()
        siemDispatcher?.stop()
        threatIntelDispatcher?.stop()
        insiderThreatService?.stop()
        deviceDiscoverer?.stop()
        dnsCollector?.stop()
        selfMonitor?.dispose()
        notificationService?.dispose()
        learningPeriodService?.dispose()
        batchQueue?.dispose()
        smartTrigger?.dispose()
        sensitivityTuner?.dispose()
        aiAnalyzer?.dispose()
        aiCache?.stopPeriodicCleanup()
        memoryWatchdog?.stop()
        pipeline?.dispose()
        monitor?.stop()
        database?.close()
        destroyTray()
    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            // noop — app stays alive in tray
        }
    })

    app.on('activate', () => {
        showMainWindow()
    })

    app.whenReady().then(() => {
        applySecurityHardening()

        // Packaged builds take the dock icon from icon.icns; unpackaged dev runs
        // fall back to the Electron binary's own icon unless we set it.
        if (process.platform === 'darwin' && !app.isPackaged) {
            app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
        }

        const autoStartEnabled = global.__fortisSettings?.autoStart ?? DEFAULT_SETTINGS.autoStart
        initAutoStart(autoStartEnabled)

        const userDataDir = app.getPath('userData')
        const { masterKey, salt } = getEncryptionConfig(userDataDir)
        configureEncryption({ masterKey, salt })

        const dbKey = getDbKey(userDataDir)
        database = new DatabaseService(join(userDataDir, 'fortis.db'), dbKey)
        const settings = database.getAllSettings()
        updateSettings(settings)

        createMainWindow()
        initTray(() => mainWindow)

        const parser = createPlatformParser()
        const scheduler = new ScanScheduler(eventBus, {
            baseInterval: settings.scanInterval,
            adaptiveEnabled: settings.adaptiveInterval,
        })

        monitor = new NetworkMonitor(eventBus, scheduler, parser)

        injectServices({ monitor, database, eventBus })

        wireRendererBridges(eventBus)

        tierGating = new TierGatingService(database, eventBus)
        injectServices({ tierGating })

        const persistedSalt = database.getSetting('anonymizerSalt')
        if (persistedSalt) {
            initializeSalt(persistedSalt)
        } else {
            const newSalt = generateSalt()
            database.setSetting('anonymizerSalt', newSalt)
            initializeSalt(newSalt)
        }

        sensitivityTuner = new SensitivityTuner()
        const storedSensitivity = settings.sensitivityLevel
        if (storedSensitivity && ['paranoid', 'balanced', 'relaxed'].includes(storedSensitivity)) {
            sensitivityTuner.setLevel(storedSensitivity)
        }

        pipeline = new EventPipeline({
            eventBus,
            monitor,
            scheduler,
            database,
            sensitivityTuner,
        })
        pipeline.wire()

        const providerInstances = new Map<AIProviderType, IAIProvider>()
        providerInstances.set('openai', new OpenAIProvider(database))
        providerInstances.set('anthropic', new AnthropicProvider(database))
        const ollamaProvider = new OllamaProvider(database)
        providerInstances.set('ollama', ollamaProvider)

        aiCache = new AICache(database)
        aiCache.startPeriodicCleanup()

        const confidenceScorer = new ConfidenceScorer(sensitivityTuner)
        aiAnalyzer = new AIAnalyzerService(eventBus, database, aiCache, providerInstances, confidenceScorer, tierGating)
        injectServices({ analyzer: aiAnalyzer, ollamaProvider })

        smartTrigger = new SmartTriggerService(eventBus, database, sensitivityTuner)
        smartTrigger.setTierGating(tierGating)

        batchQueue = new ConnectionBatchQueue({ flushIntervalMs: 15_000, maxBatchSize: 10 })
        batchQueue.setFlushCallback((_connections, combinedDiff, tier, reason) => {
            if (!aiAnalyzer) return
            if (!aiAnalyzer.getActiveProvider()) return

            void aiAnalyzer.analyze({
                newConnections: combinedDiff.newConnections,
                droppedConnections: combinedDiff.droppedConnections,
                totalActive: combinedDiff.totalActive,
            }).then((result) => {
                if (result) {
                    smartTrigger?.recordAnalysis()
                }
            }).catch((err) => {
                console.error(`[AIAnalyzer] Batch analysis error (${tier}, ${reason}):`, err)
            })
        })

        notificationService = new NotificationService(eventBus, database, sensitivityTuner)
        notificationService.wire()

        whitelistService = new WhitelistService(database, eventBus)
        pipeline.setWhitelistService(whitelistService)
        smartTrigger.setWhitelistService(whitelistService)
        injectServices({ whitelistService })

        learningPeriodService = new LearningPeriodService(eventBus, database)
        learningPeriodService.initialize()
        pipeline.setLearningPeriodService(learningPeriodService)

        eventBus.on('diff:detected', (payload) => {
            if (!smartTrigger || !aiAnalyzer) return
            if (!aiAnalyzer.getActiveProvider()) {
                eventBus.emit('analysis:skipped', { reason: 'ai_disabled' })
                return
            }

            const decision = smartTrigger.evaluate(payload.diff)

            if (!decision.shouldCall) {
                eventBus.emit('analysis:skipped', { reason: decision.reason })
                return
            }

            if (decision.shouldBatch && batchQueue) {
                batchQueue.enqueue(payload.diff, decision.modelTier, decision.reason)
                return
            }

            if (decision.shouldBatch && !batchQueue) {
                aiAnalyzer.analyze(payload.diff).then((result) => {
                    if (result) {
                        smartTrigger?.recordAnalysis()
                    }
                }).catch((err) => {
                    console.error('[AIAnalyzer] Unhandled analysis error:', err)
                })
                return
            }

            batchQueue?.sendImmediate(payload.diff, decision.modelTier, decision.reason)
            if (!batchQueue) {
                aiAnalyzer.analyze(payload.diff).then((result) => {
                    if (result) {
                        smartTrigger?.recordAnalysis()
                    }
                }).catch((err) => {
                    console.error('[AIAnalyzer] Unhandled analysis error:', err)
                })
            }
        })

        smartTrigger.startPeriodicCheck(() => {
            if (!monitor || !aiAnalyzer) return
            if (!aiAnalyzer.getActiveProvider()) return

            const connections = monitor.getPreviousConnections()
            if (connections.length === 0) return

            aiAnalyzer.analyze({
                newConnections: [],
                droppedConnections: [],
                totalActive: connections.length,
            }).then((result) => {
                if (result) {
                    smartTrigger?.recordAnalysis()
                }
            }).catch((err) => {
                console.error('[AIAnalyzer] Periodic check error:', err)
            })
        })

        memoryWatchdog = new MemoryWatchdog({
            onSoftLimit: () => {
                try {
                    updateCachedConnections([])
                } catch {
                    // noop
                }
            },
            onHardLimit: () => {
                try {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        const bounds = mainWindow.getBounds()
                        database?.setSetting('windowBounds', bounds)
                    }
                } catch {
                    // noop
                }
            },
        })
        memoryWatchdog.start()

        onPauseToggle((state) => {
            if (state === 'paused') {
                monitor?.pause()
            } else {
                monitor?.resume()
            }
        })

        onSettingsClick(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(IPC_CHANNELS.NAVIGATE_TO, 'settings')
            }
        })

        global.__fortisSettingsChanged = (key: string, value: unknown) => {
            eventBus.emit('settings:changed', { key, value })
        }

        eventBus.on('settings:changed', (payload) => {
            if (payload.key === 'aiProvider' && aiAnalyzer) {
                const providerValue = payload.value as string
                if (providerValue === 'openai' || providerValue === 'anthropic' || providerValue === 'ollama') {
                    aiAnalyzer.setProvider(providerValue)
                } else if (providerValue === 'none' || !providerValue) {
                    aiAnalyzer.disableProvider()
                }
            }
            if (
                (payload.key === 'remoteServerHost' || payload.key === 'remoteServerPort' ||
                    payload.key === 'remoteServerTlsEnabled' || payload.key === 'remoteServerCertPath' ||
                    payload.key === 'remoteServerKeyPath') &&
                remoteServer &&
                database?.getSetting('remoteServerEnabled')
            ) {
                remoteServer.restart()
            }
        })

        eventBus.on('ai:provider-disabled', () => {
            if (batchQueue) {
                batchQueue.clearBuffer()
            }
        })

        selfMonitor = new SelfMonitorService(eventBus)
        selfMonitor.setNetworkMonitor(monitor)

        const storedHash = database.getSetting('binaryHash') as string | null
        if (storedHash) {
            selfMonitor.setStoredHash(storedHash)
        }

        selfMonitor.initialize().then(() => {
            const newHash = selfMonitor?.getStoredHash()
            if (newHash && newHash !== storedHash) {
                database?.setSetting('binaryHash', newHash)
            }
        }).catch((err) => {
            console.error('[SelfMonitor] Initialization error:', err)
        })

        const datasetResourcesPath = app.isPackaged ? process.resourcesPath : undefined
        const appPath = app.getAppPath()
        const datasetDevRoots = [appPath, join(appPath, '..'), join(appPath, '..', '..'), process.cwd()]
        const ouiPath = findDatasetPath(datasetResourcesPath, datasetDevRoots, 'oui-map.json')
        const { map: ouiMap } = loadOuiMap(ouiPath)

        const geoBinPath = findDatasetPath(datasetResourcesPath, datasetDevRoots, 'ip-city.bin')
        const geoMetaPath = findDatasetPath(datasetResourcesPath, datasetDevRoots, 'ip-city.meta.json')
        const { db: geoDb } = loadGeoip(geoBinPath, geoMetaPath)

        deviceDiscoverer = new DeviceDiscoverer({
            database,
            eventBus,
            ouiMap,
            onAlert: (alert) => {
                pushNewAlert(alert)
            },
        })

        dnsCollector = new DnsCollector({
            database,
            eventBus,
            getConnections: () => monitor?.getPreviousConnections() ?? [],
        })

        vpnLeakDetector = new VpnLeakDetector({
            database,
            eventBus,
            onAlert: (alert) => {
                pushNewAlert(alert)
            },
        })
        injectServices({ vpnProvider: vpnLeakDetector })

        geoLocator = new GeoLocator({
            eventBus,
            getConnections: () => monitor?.getPreviousConnections() ?? [],
            db: geoDb,
        })
        injectServices({ geoProvider: geoLocator })

        iotMonitor = new IotMonitor({
            database,
            eventBus,
            getConnections: () => monitor?.getPreviousConnections() ?? [],
            db: geoDb,
            onAlert: (alert) => {
                pushNewAlert(alert)
            },
        })
        injectServices({ iotProvider: iotMonitor })

        reportGenerator = new ReportGenerator({
            db: database,
            eventBus,
            monitor: { getPreviousConnections: () => monitor?.getPreviousConnections() ?? [] },
            analyzer: aiAnalyzer,
            geoProvider: geoLocator,
        })
        injectServices({ reportGenerator })

        flowLocator = new FlowLocator({
            eventBus,
            getConnections: () => monitor?.getPreviousConnections() ?? [],
        })
        injectServices({ flowProvider: flowLocator })

        ruleEngine = new RuleEngine({
            database,
            eventBus,
            onAlert: pushNewAlert,
            countryForIp: (ip) =>
                geoLocator?.getCurrentGeoConnections().find((g) => g.remoteAddress === ip)?.countryCode ?? '',
        })
        injectServices({
            ruleEngine: {
                getRules: () => ruleEngine?.getRules() ?? [],
                saveRule: (r) => ruleEngine?.saveRule(r) ?? [],
                deleteRule: (id) => ruleEngine?.deleteRule(id) ?? [],
            },
        })

        const defenseService = new DefenseService({ database, eventBus })
        injectServices({
            defenseService: {
                getActions: () => defenseService.getActions(),
                confirmKill: (id) => defenseService.confirmKill(id),
                confirmBlock: (id) => defenseService.confirmBlock(id),
                cancelAction: (id) => defenseService.cancelAction(id),
                getBlockedIps: () => defenseService.getBlockedIps(),
                unblock: (ip) => defenseService.unblock(ip),
            },
        })

        certMonitor = new CertMonitor({ database, eventBus, onAlert: pushNewAlert })
        injectServices({ certProvider: { getCerts: () => certMonitor?.getCerts() ?? [] } })

        bandwidthMonitor = new BandwidthMonitor(eventBus, createBandwidthSource())
        injectServices({
            bandwidthProvider: {
                getCurrent: () => bandwidthMonitor?.getCurrent() ?? EMPTY_BANDWIDTH_SNAPSHOT,
            },
        })

        webhookDispatcher = new WebhookDispatcher({ database, eventBus })
        injectServices({
            webhookDispatcher: {
                test: (url) => webhookDispatcher?.test(url) ?? Promise.resolve(false),
            },
        })

        const reportPdfExporter = new ReportPdfExporter(database)
        injectServices({
            reportPdf: { exportPdf: (id) => reportPdfExporter.exportPdf(id) },
        })

        const { autoUpdater } = electronUpdater
        autoUpdater.logger = null
        autoUpdater.autoDownload = false
        updateService = new UpdateService({ eventBus, updater: autoUpdater as unknown as UpdaterSeam })
        injectServices({
            updateService: {
                getStatus: () => updateService?.getStatus() ?? { kind: 'disabled' },
                check: () => updateService?.check() ?? Promise.resolve(),
                download: () => updateService?.download() ?? Promise.resolve(),
                install: () => updateService?.install(),
            },
        })
        updateService.start()

        const remoteDb = database
        remoteServer = new RemoteServer({
            eventBus,
            getToken: () => remoteDb.getSetting('remoteAuthToken'),
            getConfig: () => ({
                enabled: remoteDb.getSetting('remoteServerEnabled'),
                host: remoteDb.getSetting('remoteServerHost'),
                port: remoteDb.getSetting('remoteServerPort'),
                tlsEnabled: remoteDb.getSetting('remoteServerTlsEnabled'),
                certPath: remoteDb.getSetting('remoteServerCertPath'),
                keyPath: remoteDb.getSetting('remoteServerKeyPath'),
            }),
        })
        pagerDutyDispatcher = new PagerDutyDispatcher({ database, eventBus, source: 'fortis-desktop' })
        injectServices({
            remoteServer: {
                getState: () => remoteServer?.getState() ?? { enabled: false, listening: false, host: '127.0.0.1', port: 47600, agentCount: 0 },
                getRecentEvents: () => remoteServer?.getRecentEvents() ?? [],
                getAgents: () => remoteServer?.getAgents() ?? [],
                start: () => remoteServer?.start(),
                stop: () => remoteServer?.stop(),
            },
            pagerDutyDispatcher: {
                isConfigured: () => pagerDutyDispatcher?.isConfigured() ?? false,
                test: (key) => pagerDutyDispatcher?.test(key) ?? Promise.resolve(false),
            },
        })
        remoteServer.start()
        pagerDutyDispatcher.start()

        const enterpriseDb = database
        sessionService = new SessionService({ database: enterpriseDb, eventBus })
        restApiServer = new RestApiServer({
            eventBus,
            getConfig: () => ({
                enabled: enterpriseDb.getSetting('restApiEnabled'),
                host: '127.0.0.1',
                port: enterpriseDb.getSetting('restApiPort'),
            }),
            getToken: () => enterpriseDb.getSetting('restApiToken'),
            data: {
                health: () => ({ ok: true, version: app.getVersion(), monitoring: monitoringActive }),
                connections: () => getCachedConnections().map((c) => ({ processName: c.processName, remoteAddress: c.remoteAddress, remotePort: c.remotePort, state: c.state })),
                alerts: () => enterpriseDb.getRecentAlerts(50).map((a) => ({ id: a.id, title: a.title, threatLevel: a.threatLevel, timestamp: a.timestamp })),
                agents: () => remoteServer?.getState().agentCount ?? 0,
            },
        })
        siemDispatcher = new SiemDispatcher({ database: enterpriseDb, eventBus })
        complianceService = new ComplianceService({
            database: enterpriseDb,
            eventBus,
            retentionDays: () => (enterpriseDb.getSetting('tier') === 'free' ? 7 : 90),
        })
        insiderThreatService = new InsiderThreatService({ database: enterpriseDb, eventBus, onAlert: pushNewAlert })
        threatIntelDispatcher = new ThreatIntelDispatcher({ database: enterpriseDb, eventBus })
        injectServices({
            sessionService: {
                login: (u, p) => sessionService?.login(u, p) ?? null,
                resolve: (t) => sessionService?.resolve(t) ?? null,
                resolveSession: (t) => sessionService?.resolveSession(t) ?? null,
                logout: (t) => sessionService?.logout(t),
                listUsers: () => sessionService?.listUsers() ?? [],
                createUser: (u, p, r) => sessionService?.createUser(u, p, r) ?? null,
                setUserDisabled: (id, d) => sessionService?.setUserDisabled(id, d) ?? [],
                deleteUser: (id) => sessionService?.deleteUser(id) ?? [],
                isRbacActive: () => sessionService?.isRbacActive() ?? false,
            },
            restApiServer: {
                getState: () => restApiServer?.getState() ?? { enabled: false, listening: false, host: '127.0.0.1', port: 47700 },
                start: () => restApiServer?.start(),
                stop: () => restApiServer?.stop(),
                restart: () => restApiServer?.restart(),
            },
            siemDispatcher: {
                isConfigured: () => siemDispatcher?.isConfigured() ?? false,
                test: (v, e, t) => siemDispatcher?.test(v, e, t) ?? Promise.resolve(false),
            },
            complianceService: {
                generate: (f) => complianceService!.generate(f),
                exportPdf: (f) => complianceService?.exportPdf(f) ?? Promise.resolve(''),
                getLast: () => complianceService?.getLast() ?? null,
            },
            insiderService: {
                getRecentEvents: () => insiderThreatService?.getRecentEvents() ?? [],
            },
            threatIntelDispatcher: {
                getState: () => threatIntelDispatcher!.getState(),
                setEnabled: (enabled) => threatIntelDispatcher!.setEnabled(enabled),
                setConfig: (cfg) => threatIntelDispatcher!.setConfig(cfg),
                test: (endpoint, key) => threatIntelDispatcher?.test(endpoint, key) ?? Promise.resolve(false),
                previewBatch: (alerts) => threatIntelDispatcher?.previewBatch(alerts) ?? [],
            },
        })
        restApiServer.start()
        siemDispatcher.start()
        insiderThreatService.start()
        threatIntelDispatcher.start()

        eventBus.on('scan:complete', () => {
            void vpnLeakDetector?.evaluate()
            flowLocator?.update()
        })

        eventBus.on('scan:complete', () => {
            geoLocator?.update()
        })

        eventBus.on('scan:complete', () => {
            iotMonitor?.update()
        })

        eventBus.on('devices:discovered', () => {
            iotMonitor?.update()
        })

        if (settings.onboardingCompleted) {
            monitoringActive = true
            monitor.start()
            deviceDiscoverer.start()
            dnsCollector.start()
            void vpnLeakDetector.evaluate()
            geoLocator.update()
            iotMonitor.update()
            ruleEngine.start()
            certMonitor.start()
            bandwidthMonitor.start()
            webhookDispatcher.start()
        }

        periodicMaintenance()
        m1PruneTimer = setInterval(periodicMaintenance, M1_PRUNE_INTERVAL_MS)
    })
}

declare global {
    // eslint-disable-next-line no-var
    var __fortisSettings: {
        windowBounds?: Electron.Rectangle
        autoStart?: boolean
    } | undefined
    // eslint-disable-next-line no-var
    var __fortisSettingsChanged: ((key: string, value: unknown) => void) | undefined
}

function createPlatformParser(): IConnectionParser {
    return new WorkerOffloadParser()
}

export { mainWindow, showMainWindow, monitor, database, memoryWatchdog, aiAnalyzer, smartTrigger, notificationService, sensitivityTuner, whitelistService, learningPeriodService, batchQueue, tierGating, selfMonitor, deviceDiscoverer, dnsCollector, vpnLeakDetector, geoLocator, iotMonitor }

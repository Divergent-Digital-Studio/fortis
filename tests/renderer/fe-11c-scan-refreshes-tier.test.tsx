import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSettingsStore } from '@renderer/stores/settings-store'

const refresh = vi.fn(async () => {})

vi.mock('@renderer/hooks/useAIStatus', () => ({
    default: () => ({
        aiStatus: null,
        usageStats: null,
        tierInfo: {
            tier: 'free', remainingScans: 3, totalAllowedScans: 10,
            isLearningPeriod: false, learningDaysRemaining: 0,
            isAutoTriggersEnabled: false, isNotificationsEnabled: false,
        },
        lastAnalysis: null,
        loading: false,
        error: null,
        refresh,
    }),
}))

beforeEach(() => {
    refresh.mockClear()
})

describe('FE-11c a successful scan refreshes tier info immediately', () => {
    it('calls useAIStatus.refresh after triggerAIAnalysis resolves', async () => {
        const completedSettings = {
            ...useSettingsStore.getState().settings,
            onboardingCompleted: true,
        }
        useSettingsStore.setState({ settings: completedSettings, isLoaded: true })

        ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
            triggerScan: async () => {},
            triggerAIAnalysis: async () => null,
            getConnections: async () => [],
            getSettings: async () => completedSettings,
            onSettingsChanged: () => () => {},
            getMonitoringStatus: async () => ({
                isRunning: true, isPaused: false, scanInterval: 5000,
                lastScanTimestamp: null, connectionCount: 0,
            }),
            onScanStatus: () => () => {},
            onConnectionsUpdate: () => () => {},
            onAnalysisUpdate: () => () => {},
            onLearningStatus: () => () => {},
            onNewAlert: () => () => {},
            pauseMonitoring: async () => {},
            resumeMonitoring: async () => {},
            getAlertCounts: async () => ({
                total: 0, critical: 0, danger: 0, warning: 0, info: 0, unacknowledged: 0,
            }),
            onNavigateTo: () => () => {},
            updateSettings: async () => {},
            getTierInfo: async () => completedSettings,
        }

        const { default: App } = await import('@renderer/App')
        render(<App />)

        const scanBtn = await screen.findByRole('button', { name: /Scan Now/i })
        await userEvent.click(scanBtn)

        await waitFor(() => {
            expect(refresh).toHaveBeenCalled()
        })
    })
})

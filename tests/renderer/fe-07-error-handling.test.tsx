import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConnectionStore } from '@renderer/stores/connection-store'
import { useSettingsStore } from '@renderer/stores/settings-store'

const aiStatusResult = {
    aiStatus: null,
    usageStats: null,
    tierInfo: null,
    lastAnalysis: null,
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
}

vi.mock('@renderer/hooks/useAIStatus', () => ({
    default: () => aiStatusResult,
}))

async function selectProvider(label: string): Promise<void> {
    const combobox = await screen.findByRole('combobox')
    await userEvent.click(combobox)
    const option = await screen.findByRole('option', { name: label })
    await userEvent.click(option)
}

beforeEach(() => {
    useConnectionStore.getState().clearConnections()
    useConnectionStore.getState().setScanStatus('idle')
})

describe('FE-07a App.handleScanNow surfaces scan failures', () => {
    it('sets scanStatus to error when the AI analysis rejects (not stuck idle)', async () => {
        const completedSettings = {
            ...useSettingsStore.getState().settings,
            onboardingCompleted: true,
        }
        useSettingsStore.setState({ settings: completedSettings, isLoaded: true })

        ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
            triggerScan: async () => {},
            triggerAIAnalysis: async () => { throw new Error('boom') },
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
            getTierInfo: async () => ({
                tier: 'free', remainingScans: 3, totalAllowedScans: 10,
                isLearningPeriod: false, learningDaysRemaining: 0,
                isAutoTriggersEnabled: false, isNotificationsEnabled: false,
            }),
        }

        const { default: App } = await import('@renderer/App')
        render(<App />)

        const scanBtn = await screen.findByRole('button', { name: /Scan Now/i })
        await userEvent.click(scanBtn)

        await waitFor(() => {
            expect(useConnectionStore.getState().scanStatus).toBe('error')
        })
    })
})

describe('FE-07b AIConfigSection surfaces IPC rejections', () => {
    function installFortis(overrides: Record<string, unknown> = {}): void {
        ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
            validateApiKey: async () => { throw new Error('network down') },
            setApiKey: async () => { throw new Error('disk error') },
            ...overrides,
        }
    }

    it('leaves the Testing state and shows an error when validateApiKey rejects', async () => {
        installFortis()
        const { default: AIConfigSection } = await import(
            '@renderer/components/settings/AIConfigSection'
        )
        render(<AIConfigSection aiProvider="openai" onAIProviderChange={() => {}} />)

        const keyInput = screen.getByLabelText('API Key')
        await userEvent.type(keyInput, 'sk-test')
        await userEvent.click(screen.getByRole('button', { name: /Verify/i }))

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Testing/i })).not.toBeInTheDocument()
        })
        expect(screen.getByText(/network down/i)).toBeInTheDocument()
    })

    it('leaves the Saving state and shows an error when setApiKey rejects', async () => {
        installFortis()
        const { default: AIConfigSection } = await import(
            '@renderer/components/settings/AIConfigSection'
        )
        render(<AIConfigSection aiProvider="openai" onAIProviderChange={() => {}} />)

        const keyInput = screen.getByLabelText('API Key')
        await userEvent.type(keyInput, 'sk-test')
        await userEvent.click(screen.getByRole('button', { name: /^Save$/i }))

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Saving/i })).not.toBeInTheDocument()
        })
        expect(screen.getByText(/disk error/i)).toBeInTheDocument()
    })
})

describe('FE-07c OnboardingWizard does not complete when setApiKey fails', () => {
    it('does not call updateSettings or triggerScan when setApiKey resolves {success:false}', async () => {
        const updateSettings = vi.fn(async () => {})
        const triggerScan = vi.fn(async () => {})
        const setApiKey = vi.fn(async () => ({ success: false, error: 'rejected key' }))

        const incompleteSettings = {
            ...useSettingsStore.getState().settings,
            onboardingCompleted: false,
        }
        useSettingsStore.setState({ settings: incompleteSettings, isLoaded: true })

        ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
            getSettings: async () => incompleteSettings,
            updateSettings,
            setApiKey,
            triggerScan,
            getMonitoringStatus: async () => ({
                isRunning: false, isPaused: false, scanInterval: 5000,
                lastScanTimestamp: null, connectionCount: 0,
            }),
            onScanStatus: () => () => {},
            onSettingsChanged: () => () => {},
        }

        const { default: OnboardingWizard } = await import(
            '@renderer/components/onboarding/OnboardingWizard'
        )
        render(<OnboardingWizard />)

        await selectProvider('OpenAI')

        await userEvent.click(await screen.findByRole('button', { name: /^Next$/i }))

        const apiInput = await screen.findByLabelText('OpenAI API Key')
        await userEvent.type(apiInput, 'sk-bad-key')

        await userEvent.click(screen.getByRole('button', { name: /^Next$/i }))

        await userEvent.click(await screen.findByRole('button', { name: /Get Started/i }))

        await waitFor(() => {
            expect(setApiKey).toHaveBeenCalledWith('openai', 'sk-bad-key')
        })
        expect(updateSettings).not.toHaveBeenCalled()
        expect(triggerScan).not.toHaveBeenCalled()
        expect(screen.getByText(/rejected key/i)).toBeInTheDocument()
    })
})

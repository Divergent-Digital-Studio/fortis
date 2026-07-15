import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useSettingsStore } from '@renderer/stores/settings-store'
import type { SubscriptionTier } from '@shared/types/settings'

function installFortisMock(): void {
    ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
        onNewAlert: () => () => {},
        onAnalysisUpdate: () => () => {},
        getAppVersion: async () => '1.2.3',
        getPlatform: async () => 'darwin',
        getLicenseStatus: async () => ({ tier: useSettingsStore.getState().settings.tier, valid: false, reason: 'no-license', expiresAt: null, machineLocked: false, customerId: null, seatCount: null }),
        onLicenseChanged: () => () => {},
    }
}

function setTier(tier: SubscriptionTier): void {
    useSettingsStore.getState().updateSettings({ tier })
}

beforeEach(() => {
    installFortisMock()
    useSettingsStore.getState().resetSettings()
})

describe('FE-03 Sidebar footer reads the real tier', () => {
    it('shows Free for a free-tier user', async () => {
        setTier('free')
        const { default: Sidebar } = await import('@renderer/components/layout/Sidebar')
        render(<Sidebar />)
        expect(screen.getByText('Free')).toBeInTheDocument()
    })

    it('shows Pro (not Free) for a pro-tier user', async () => {
        setTier('pro')
        const { default: Sidebar } = await import('@renderer/components/layout/Sidebar')
        render(<Sidebar />)
        expect(screen.getByText('Pro')).toBeInTheDocument()
        expect(screen.queryByText('Free')).not.toBeInTheDocument()
    })
})

describe('FE-03 AboutSection reads the real tier', () => {
    it('shows Pro and never the marketing Shield label', async () => {
        setTier('pro')
        const { default: AboutSection } = await import('@renderer/components/settings/AboutSection')
        render(<AboutSection />)
        expect(await screen.findByText('Pro')).toBeInTheDocument()
        expect(screen.queryByText(/Shield/i)).not.toBeInTheDocument()
    })

    it('shows Enterprise for an enterprise-tier user', async () => {
        setTier('enterprise')
        const { default: AboutSection } = await import('@renderer/components/settings/AboutSection')
        render(<AboutSection />)
        expect(await screen.findByText('Enterprise')).toBeInTheDocument()
    })
})

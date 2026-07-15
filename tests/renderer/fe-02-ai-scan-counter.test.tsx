import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TierInfo } from '@shared/types/ipc'
import type { UseAIStatusResult } from '@renderer/hooks/useAIStatus'

const mockUseAIStatus = vi.fn<() => UseAIStatusResult>()

vi.mock('@renderer/hooks/useAIStatus', () => ({
    default: () => mockUseAIStatus(),
}))

import AIScanCounter from '@renderer/components/dashboard/AIScanCounter'

function tierInfo(partial: Partial<TierInfo>): TierInfo {
    return {
        tier: 'free',
        remainingScans: 3,
        totalAllowedScans: 10,
        isLearningPeriod: false,
        learningDaysRemaining: 0,
        isAutoTriggersEnabled: false,
        isNotificationsEnabled: false,
        ...partial,
    }
}

function result(info: TierInfo | null, loading = false): UseAIStatusResult {
    return {
        aiStatus: null,
        usageStats: null,
        tierInfo: info,
        lastAnalysis: null,
        loading,
        error: null,
        refresh: async () => {},
    }
}

beforeEach(() => {
    mockUseAIStatus.mockReset()
})

describe('FE-02 AIScanCounter renders the quota meter for free tier', () => {
    it('renders the remaining-scans meter for a free-tier user', () => {
        mockUseAIStatus.mockReturnValue(
            result(tierInfo({ tier: 'free', remainingScans: 7, totalAllowedScans: 10 })),
        )
        render(<AIScanCounter />)
        expect(screen.getByText('7/10 AI scans remaining today')).toBeInTheDocument()
    })

    it('renders nothing for a pro-tier user', () => {
        mockUseAIStatus.mockReturnValue(result(tierInfo({ tier: 'pro' })))
        const { container } = render(<AIScanCounter />)
        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing for an enterprise-tier user', () => {
        mockUseAIStatus.mockReturnValue(result(tierInfo({ tier: 'enterprise' })))
        const { container } = render(<AIScanCounter />)
        expect(container).toBeEmptyDOMElement()
    })

    it('renders the exhausted state when no scans remain', () => {
        mockUseAIStatus.mockReturnValue(
            result(tierInfo({ tier: 'free', remainingScans: 0, totalAllowedScans: 10 })),
        )
        render(<AIScanCounter />)
        expect(screen.getByText('AI scans exhausted today')).toBeInTheDocument()
    })
})

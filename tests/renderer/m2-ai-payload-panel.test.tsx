import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AiPayloadView } from '@shared/types/m2'
import type { UseAiPayloadResult } from '@renderer/hooks/useAiPayload'

const mockUseAiPayload = vi.fn<() => UseAiPayloadResult>()
vi.mock('@renderer/hooks/useAiPayload', () => ({
    default: () => mockUseAiPayload(),
}))

import AiPayloadPanel from '@renderer/components/ai/AiPayloadPanel'

function payload(over: Partial<AiPayloadView> = {}): AiPayloadView {
    return {
        current: {
            connections: [
                { id: 'c1', protocol: 'tcp', localPort: 50000, remoteAddress: '93.184.216.34', remotePort: 443, state: 'ESTABLISHED', processName: 'chrome', isNew: false, isChanged: false },
            ],
            scanTimestamp: 1000,
            platform: 'macOS',
            totalActive: 1,
        },
        lastSent: null,
        ...over,
    }
}

function result(over: Partial<UseAiPayloadResult> = {}): UseAiPayloadResult {
    return { payload: payload(), isLoading: false, error: null, load: vi.fn(), ...over }
}

beforeEach(() => {
    mockUseAiPayload.mockReset()
})

describe('AiPayloadPanel', () => {
    it('renders the current anonymized payload inline', () => {
        mockUseAiPayload.mockReturnValue(result())
        render(<AiPayloadPanel />)
        expect(screen.getByText(/93\.184\.216\.34/)).toBeInTheDocument()
    })

    it('shows "Nothing sent yet" when there is no last-sent payload', () => {
        mockUseAiPayload.mockReturnValue(result({ payload: payload({ lastSent: null }) }))
        render(<AiPayloadPanel />)
        expect(screen.getByText('Nothing sent yet.')).toBeInTheDocument()
    })

    it('shows the privacy note', () => {
        mockUseAiPayload.mockReturnValue(result())
        render(<AiPayloadPanel />)
        expect(screen.getByText(/shown here, not transmitted/)).toBeInTheDocument()
    })

    it('loads the payload on mount', () => {
        const load = vi.fn()
        mockUseAiPayload.mockReturnValue(result({ load }))
        render(<AiPayloadPanel />)
        expect(load).toHaveBeenCalled()
    })
})

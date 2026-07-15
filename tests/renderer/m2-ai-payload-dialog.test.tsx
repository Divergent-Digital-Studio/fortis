import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AiPayloadView } from '@shared/types/m2'
import type { UseAiPayloadResult } from '@renderer/hooks/useAiPayload'
import { lookup } from '@renderer/i18n/catalog'
import en from '@renderer/i18n/locales/en.json'

const tt = (key: string) => lookup(en, en, key)

const mockUseAiPayload = vi.fn<() => UseAiPayloadResult>()
vi.mock('@renderer/hooks/useAiPayload', () => ({
    default: () => mockUseAiPayload(),
}))

import AiPayloadDialog from '@renderer/components/ai/AiPayloadDialog'

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

describe('AiPayloadDialog', () => {
    it('renders nothing when closed', () => {
        mockUseAiPayload.mockReturnValue(result())
        const { container } = render(<AiPayloadDialog isOpen={false} onClose={vi.fn()} />)
        expect(container.firstChild).toBeNull()
    })

    it('renders the current anonymized payload when open', () => {
        mockUseAiPayload.mockReturnValue(result())
        render(<AiPayloadDialog isOpen onClose={vi.fn()} />)
        expect(screen.getByText(tt('aiPayload.title'))).toBeInTheDocument()
        expect(screen.getByText(/93\.184\.216\.34/)).toBeInTheDocument()
    })

    it('shows "Nothing sent yet" when there is no last-sent payload', () => {
        mockUseAiPayload.mockReturnValue(result({ payload: payload({ lastSent: null }) }))
        render(<AiPayloadDialog isOpen onClose={vi.fn()} />)
        expect(screen.getByText(tt('aiPayload.nothingSent'))).toBeInTheDocument()
    })

    it('shows the privacy note', () => {
        mockUseAiPayload.mockReturnValue(result())
        render(<AiPayloadDialog isOpen onClose={vi.fn()} />)
        expect(screen.getByText(tt('aiPayload.note'))).toBeInTheDocument()
    })
})

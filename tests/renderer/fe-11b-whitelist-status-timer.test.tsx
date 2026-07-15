import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WhitelistManager from '@renderer/components/alerts/WhitelistManager'

function installFortisMock(overrides: Record<string, unknown> = {}): void {
    ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
        getWhitelist: async () => [],
        onWhitelistUpdate: () => () => {},
        exportWhitelist: async () => { throw new Error('export failed') },
        importWhitelist: async () => ({ imported: 2, skipped: 1 }),
        removeFromWhitelist: async () => true,
        ...overrides,
    }
}

beforeEach(() => {
    installFortisMock()
})

describe('FE-11b WhitelistManager status timer', () => {
    it('auto-dismisses an export error after the timeout', async () => {
        render(<WhitelistManager />)
        fireEvent.click(screen.getByRole('button', { name: /Whitelist Management/i }))

        const exportBtn = await screen.findByRole('button', { name: /Export/i })
        fireEvent.click(exportBtn)

        await waitFor(() => {
            expect(screen.getByText(/Failed to export whitelist/i)).toBeInTheDocument()
        })

        await waitFor(
            () => {
                expect(screen.queryByText(/Failed to export whitelist/i)).not.toBeInTheDocument()
            },
            { timeout: 5000 },
        )
    }, 8000)
})

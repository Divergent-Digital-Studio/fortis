import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '@renderer/components/common/ConfirmDialog'

describe('ConfirmDialog', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <ConfirmDialog isOpen={false} title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('fires onConfirm when confirm clicked', () => {
        const onConfirm = vi.fn()
        render(
            <ConfirmDialog isOpen title="Kill" message="Sure?" confirmLabel="Kill" destructive onConfirm={onConfirm} onCancel={() => {}} />,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Kill' }))
        expect(onConfirm).toHaveBeenCalledOnce()
    })

    it('fires onCancel on Escape', () => {
        const onCancel = vi.fn()
        render(
            <ConfirmDialog isOpen title="t" message="m" onConfirm={() => {}} onCancel={onCancel} />,
        )
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(onCancel).toHaveBeenCalledOnce()
    })
})

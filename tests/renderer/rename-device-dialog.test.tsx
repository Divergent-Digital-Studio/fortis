import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RenameDeviceDialog from '@renderer/components/devices/RenameDeviceDialog'

describe('RenameDeviceDialog', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <RenameDeviceDialog
                mac="AABBCCDDEEFF"
                initialName=""
                fallbackHint="192.168.1.50 (AABBCCDDEEFF)"
                isOpen={false}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
            />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('seeds the input with the existing custom name', () => {
        render(
            <RenameDeviceDialog
                mac="AABBCCDDEEFF"
                initialName="Front Doorbell"
                fallbackHint="camera.local"
                isOpen
                onClose={vi.fn()}
                onSubmit={vi.fn()}
            />,
        )
        expect((screen.getByLabelText('Custom name') as HTMLInputElement).value).toBe('Front Doorbell')
    })

    it('submits the trimmed name and closes the dialog', async () => {
        const onClose = vi.fn()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        render(
            <RenameDeviceDialog
                mac="AABBCCDDEEFF"
                initialName=""
                fallbackHint="camera.local"
                isOpen
                onClose={onClose}
                onSubmit={onSubmit}
            />,
        )

        fireEvent.change(screen.getByLabelText('Custom name'), { target: { value: '  Living Room Camera  ' } })
        fireEvent.click(screen.getByText('Save'))

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith('AABBCCDDEEFF', 'Living Room Camera')
        })
        expect(onClose).toHaveBeenCalled()
    })

    it('submits null when the name is cleared (empty)', async () => {
        const onClose = vi.fn()
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        render(
            <RenameDeviceDialog
                mac="AABBCCDDEEFF"
                initialName="Old Name"
                fallbackHint="camera.local"
                isOpen
                onClose={onClose}
                onSubmit={onSubmit}
            />,
        )

        fireEvent.change(screen.getByLabelText('Custom name'), { target: { value: '   ' } })
        fireEvent.click(screen.getByText('Save'))

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith('AABBCCDDEEFF', null)
        })
    })

    it('closes on Cancel without submitting', () => {
        const onClose = vi.fn()
        const onSubmit = vi.fn()
        render(
            <RenameDeviceDialog
                mac="AABBCCDDEEFF"
                initialName=""
                fallbackHint="camera.local"
                isOpen
                onClose={onClose}
                onSubmit={onSubmit}
            />,
        )
        fireEvent.click(screen.getByText('Cancel'))
        expect(onClose).toHaveBeenCalled()
        expect(onSubmit).not.toHaveBeenCalled()
    })
})

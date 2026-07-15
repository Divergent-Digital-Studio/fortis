import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotificationSection from '@renderer/components/settings/NotificationSection'

describe('FE-06 NotificationSection copy is truthful and toggles work', () => {
    it('does not contain false coming-soon copy', () => {
        render(
            <NotificationSection
                notificationsEnabled
                soundEnabled={false}
                onNotificationsChange={() => {}}
                onSoundChange={() => {}}
            />,
        )
        expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/next update/i)).not.toBeInTheDocument()
    })

    it('toggling desktop notifications calls onNotificationsChange', async () => {
        const onNotificationsChange = vi.fn()
        render(
            <NotificationSection
                notificationsEnabled={false}
                soundEnabled={false}
                onNotificationsChange={onNotificationsChange}
                onSoundChange={() => {}}
            />,
        )
        const toggle = screen.getByLabelText('Desktop Notifications')
        await userEvent.click(toggle)
        expect(onNotificationsChange).toHaveBeenCalledWith(true)
    })

    it('toggling sound alerts calls onSoundChange', async () => {
        const onSoundChange = vi.fn()
        render(
            <NotificationSection
                notificationsEnabled
                soundEnabled={false}
                onNotificationsChange={() => {}}
                onSoundChange={onSoundChange}
            />,
        )
        const toggle = screen.getByLabelText('Sound Alerts')
        await userEvent.click(toggle)
        expect(onSoundChange).toHaveBeenCalledWith(true)
    })
})

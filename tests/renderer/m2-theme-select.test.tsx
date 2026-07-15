import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppearanceSection from '@renderer/components/settings/AppearanceSection'
import { applyTheme } from '@renderer/styles/theme'

describe('AppearanceSection theme select', () => {
    it('renders the current theme', () => {
        render(<AppearanceSection theme="dark" onThemeChange={() => {}} />)
        expect(screen.getByRole('combobox')).toHaveTextContent('Dark')
    })

    it('emits the chosen theme when Light is selected', async () => {
        const onThemeChange = vi.fn()
        render(<AppearanceSection theme="dark" onThemeChange={onThemeChange} />)

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(screen.getByRole('option', { name: 'Light' }))

        expect(onThemeChange).toHaveBeenCalledWith('light')
    })
})

describe('applyTheme', () => {
    it('sets the data-theme attribute on the document element', () => {
        applyTheme('light')
        expect(document.documentElement.getAttribute('data-theme')).toBe('light')
        applyTheme('dark')
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
})

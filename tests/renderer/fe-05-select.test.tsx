import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Select from '@renderer/components/common/Select'

const OPTIONS = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Bravo' },
    { value: 'c', label: 'Charlie' },
]

describe('FE-05 Select primitive', () => {
    it('renders the selected option label in a combobox button', () => {
        render(<Select value="b" options={OPTIONS} onChange={() => {}} ariaLabel="Pick one" />)
        const combobox = screen.getByRole('combobox', { name: 'Pick one' })
        expect(combobox).toHaveTextContent('Bravo')
    })

    it('opens the listbox on click and emits the chosen value', async () => {
        const onChange = vi.fn()
        render(<Select value="a" options={OPTIONS} onChange={onChange} ariaLabel="Pick one" />)

        await userEvent.click(screen.getByRole('combobox'))
        expect(screen.getByRole('listbox')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('option', { name: 'Charlie' }))
        expect(onChange).toHaveBeenCalledWith('c')

        await waitFor(() => {
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
        })
    })

    it('supports keyboard navigation and selection', async () => {
        const onChange = vi.fn()
        render(<Select value="a" options={OPTIONS} onChange={onChange} ariaLabel="Pick one" />)

        const combobox = screen.getByRole('combobox')
        combobox.focus()
        await userEvent.keyboard('{Enter}')
        expect(screen.getByRole('listbox')).toBeInTheDocument()

        await userEvent.keyboard('{ArrowDown}')
        await userEvent.keyboard('{Enter}')
        expect(onChange).toHaveBeenCalledWith('b')
    })

    it('closes on Escape without changing the value', async () => {
        const onChange = vi.fn()
        render(<Select value="a" options={OPTIONS} onChange={onChange} ariaLabel="Pick one" />)

        await userEvent.click(screen.getByRole('combobox'))
        expect(screen.getByRole('listbox')).toBeInTheDocument()

        await userEvent.keyboard('{Escape}')
        await waitFor(() => {
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
        })
        expect(onChange).not.toHaveBeenCalled()
    })

    it('does not select a disabled option and marks it aria-disabled', async () => {
        const onChange = vi.fn()
        const withDisabled = [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Bravo', disabled: true },
        ]
        render(<Select value="a" options={withDisabled} onChange={onChange} ariaLabel="Pick one" />)

        await userEvent.click(screen.getByRole('combobox'))
        const disabledOption = screen.getByRole('option', { name: 'Bravo' })
        expect(disabledOption).toHaveAttribute('aria-disabled', 'true')

        await userEvent.click(disabledOption)
        expect(onChange).not.toHaveBeenCalled()
        expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('renders the open listbox in a document.body portal', async () => {
        render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Pick one" />)
        await userEvent.click(screen.getByRole('combobox'))
        const listbox = screen.getByRole('listbox')
        expect(listbox.parentElement).toBe(document.body)
    })

    it('closes when clicking outside', async () => {
        render(
            <div>
                <Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Pick one" />
                <button type="button">outside</button>
            </div>,
        )

        await userEvent.click(screen.getByRole('combobox'))
        expect(screen.getByRole('listbox')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'outside' }))
        await waitFor(() => {
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
        })
    })
})

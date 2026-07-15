import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HubOrbit, { type HubNode } from '@renderer/components/common/HubOrbit'
import useOrbitHover from '@renderer/hooks/useOrbitHover'

const NODES: HubNode[] = [
    { id: 'a', label: 'alpha', weight: 3, outer: false },
    { id: 'b', label: 'beta', weight: 1, outer: true },
]

/** Wire the orbit to the hover hook exactly as the real pages do. */
function Harness() {
    const { hoveredId, onHover } = useOrbitHover()
    return (
        <HubOrbit
            nodes={NODES}
            hubLabel="Hub"
            selectedId={null}
            onSelect={vi.fn()}
            ariaLabel="Test orbit"
            onHover={onHover}
            hoveredId={hoveredId}
        />
    )
}

function nodeCentres(container: HTMLElement): string {
    return [...container.querySelectorAll('.hub-orbit__node circle')]
        .map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`)
        .join('|')
}

/** Let a few real animation frames run, so an unpaused orbit advances its yaw. */
function spinAWhile(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 80))
}

describe('orbit hover pauses the spin', () => {
    it('keeps rotating while nothing is hovered', async () => {
        const { container } = render(<Harness />)
        const before = nodeCentres(container)
        await spinAWhile()
        await waitFor(() => expect(nodeCentres(container)).not.toBe(before))
    })

    it('freezes every node while the cursor rests on one', async () => {
        const { container } = render(<Harness />)

        await userEvent.setup().hover(screen.getByRole('button', { name: 'alpha' }))
        // Let the paused frame settle before sampling.
        await spinAWhile()

        const frozen = nodeCentres(container)
        await spinAWhile()
        expect(nodeCentres(container)).toBe(frozen)
    })

    it('resumes once the cursor leaves the node', async () => {
        const { container } = render(<Harness />)
        const user = userEvent.setup()
        const node = screen.getByRole('button', { name: 'alpha' })

        await user.hover(node)
        await spinAWhile()
        const frozen = nodeCentres(container)

        await user.unhover(node)
        await spinAWhile()
        await waitFor(() => expect(nodeCentres(container)).not.toBe(frozen))
    })
})

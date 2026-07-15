import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FlowGraph } from '@shared/types/m2'
import type { UseFlowResult } from '@renderer/hooks/useFlow'

const mockUseFlow = vi.fn<() => UseFlowResult>()
vi.mock('@renderer/hooks/useFlow', () => ({
    default: () => mockUseFlow(),
}))

import FlowView from '@renderer/components/flow/FlowView'

const graph: FlowGraph = {
    nodes: [
        { id: 'p:chrome', label: 'chrome', kind: 'process', x: 0.1, y: 0.5, weight: 2 },
        { id: 'd:1.1.1.1', label: '1.1.1.1', kind: 'destination', x: 0.9, y: 0.5, weight: 2 },
    ],
    edges: [{ from: 'p:chrome', to: 'd:1.1.1.1', weight: 2 }],
}

function result(over: Partial<UseFlowResult> = {}): UseFlowResult {
    return { graph, isLoading: false, error: null, refresh: vi.fn(), ...over }
}

beforeEach(() => {
    mockUseFlow.mockReset()
    localStorage.clear()
})

/** The toolbar's view toggle renders Lucide icons, which are <svg> elements too. */
function orbitSvg(container: HTMLElement): SVGSVGElement {
    const svg = container.querySelector<SVGSVGElement>('.flow-view__svg')
    expect(svg).not.toBeNull()
    return svg!
}

describe('FlowView', () => {
    it('renders nodes and edges for graph data', () => {
        mockUseFlow.mockReturnValue(result())
        const { container } = render(<FlowView />)
        const svg = orbitSvg(container)
        expect(svg.querySelectorAll('circle').length).toBe(2)
        expect(svg.querySelectorAll('line').length).toBe(1)
        expect(screen.getByText('chrome')).toBeInTheDocument()
        expect(screen.getByText('1.1.1.1')).toBeInTheDocument()
    })

    it('shows EmptyState when the graph is empty', () => {
        mockUseFlow.mockReturnValue(result({ graph: { nodes: [], edges: [] } }))
        render(<FlowView />)
        expect(screen.getByText('No connections to map')).toBeInTheDocument()
    })

    it('plots every node of a dense graph on the orbit', () => {
        const nodes = Array.from({ length: 30 }, (_, i) => ({
            id: `p:proc${i}`,
            label: `proc${i}`,
            kind: 'process' as const,
            x: 0.1,
            y: 0.05 + (0.9 * i) / 29,
            weight: 1,
        }))
        nodes.push({ id: 'd:1.1.1.1', label: '1.1.1.1', kind: 'destination' as const, x: 0.9, y: 0.5, weight: 1 })
        mockUseFlow.mockReturnValue(result({ graph: { nodes, edges: [] } }))

        const { container } = render(<FlowView />)
        expect(orbitSvg(container).querySelectorAll('circle').length).toBe(31)
    })

    it('switches to the table view and lists each edge as a row', async () => {
        const user = userEvent.setup()
        mockUseFlow.mockReturnValue(result())
        const { container } = render(<FlowView />)

        await user.click(screen.getByRole('button', { name: 'Table' }))

        expect(container.querySelector('.flow-view__svg')).toBeNull()
        expect(screen.getByRole('table', { name: 'Connection flow' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: /Destination/ })).toBeInTheDocument()
        expect(screen.getByText('chrome')).toBeInTheDocument()
        expect(screen.getByText('1.1.1.1')).toBeInTheDocument()
    })

    it('defaults to the visual view but remembers a switch to the table', async () => {
        const user = userEvent.setup()
        mockUseFlow.mockReturnValue(result())

        const first = render(<FlowView />)
        expect(first.container.querySelector('.flow-view__svg')).not.toBeNull()
        await user.click(screen.getByRole('button', { name: 'Table' }))
        first.unmount()

        const second = render(<FlowView />)
        expect(second.container.querySelector('.flow-view__svg')).toBeNull()
    })
})

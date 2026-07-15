import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import HubOrbit, { type HubNode } from '@renderer/components/common/HubOrbit'

function nodes(count: number): HubNode[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        label: `node-${i}`,
        weight: i,
        outer: i % 2 === 0,
    }))
}

function renderOrbit(count: number, selectedId: string | null = null) {
    return render(
        <HubOrbit
            nodes={nodes(count)}
            hubLabel="Hub"
            selectedId={selectedId}
            onSelect={vi.fn()}
            ariaLabel="Test orbit"
        />,
    )
}

/**
 * Median distance from a node to its nearest neighbour on screen. Uniqueness is
 * not enough — the old ring layout produced unique-but-touching coordinates —
 * and a bare minimum is noisy, since perspective can project two far-apart
 * nodes close together. The median says whether the field is legible overall.
 */
function medianNearestNeighbour(container: HTMLElement): number {
    const points = [...container.querySelectorAll('.hub-orbit__node circle')].map((c) => ({
        x: Number(c.getAttribute('cx')),
        y: Number(c.getAttribute('cy')),
    }))

    const nearest = points.map((a, i) => {
        let min = Infinity
        points.forEach((b, j) => {
            if (i === j) return
            min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y))
        })
        return min
    })

    nearest.sort((a, b) => a - b)
    return nearest[Math.floor(nearest.length / 2)] ?? 0
}

describe('HubOrbit', () => {
    it('draws guide rings for a small node set', () => {
        const { container } = renderOrbit(6)
        expect(container.querySelectorAll('.hub-orbit__ring').length).toBe(2)
        expect(container.querySelectorAll('.hub-orbit__node').length).toBe(6)
    })

    it('drops the guide rings once the sphere layout takes over', () => {
        const { container } = renderOrbit(120)
        expect(container.querySelectorAll('.hub-orbit__ring').length).toBe(0)
        expect(container.querySelectorAll('.hub-orbit__node').length).toBe(120)
    })

    it('keeps crowded nodes far enough apart to read', () => {
        const { container } = renderOrbit(200)
        // Nodes are >=16px across. At 200 nodes the sphere yields a median gap
        // of ~28px; the two rings it replaced managed only ~13px, so they
        // overlapped. 20 sits between the two and fails if rings ever return.
        expect(medianNearestNeighbour(container)).toBeGreaterThan(20)
    })

    it('draws one spoke per node when sparse, and none when crowded', () => {
        expect(renderOrbit(6).container.querySelectorAll('.hub-orbit__spoke').length).toBe(6)
        expect(renderOrbit(120).container.querySelectorAll('.hub-orbit__spoke').length).toBe(0)
    })

    it('keeps a spoke for the selected node while crowded', () => {
        const { container } = renderOrbit(120, 'n7')
        expect(container.querySelectorAll('.hub-orbit__spoke').length).toBe(1)
    })

    it('labels every node when few, and only the heaviest when many', () => {
        expect(renderOrbit(6).container.querySelectorAll('.hub-orbit__node text').length).toBe(6)
        expect(renderOrbit(200).container.querySelectorAll('.hub-orbit__node text').length).toBe(18)
    })

    it('always labels the selected node, however light it is', () => {
        // n0 has weight 0, so it never makes the top-18 cut on its own.
        const { container } = renderOrbit(200, 'n0')
        const labels = [...container.querySelectorAll('.hub-orbit__node text')].map((t) => t.textContent)
        expect(labels).toContain('node-0')
    })

    it('titles every node so hover names the ones without labels', () => {
        const { container } = renderOrbit(200)
        expect(container.querySelectorAll('.hub-orbit__node title').length).toBe(200)
    })
})

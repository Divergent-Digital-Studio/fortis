import { describe, it, expect } from 'vitest'
import { buildFlowGraph } from './flow-graph'

const conns = [
    { processName: 'chrome', remoteAddress: '1.1.1.1' },
    { processName: 'chrome', remoteAddress: '1.1.1.1' },
    { processName: 'chrome', remoteAddress: '8.8.8.8' },
    { processName: 'node', remoteAddress: '8.8.8.8' },
]

describe('buildFlowGraph', () => {
    it('builds process + destination nodes with weighted edges', () => {
        const g = buildFlowGraph(conns)
        expect(g.nodes.filter((n) => n.kind === 'process').map((n) => n.label).sort()).toEqual(['chrome', 'node'])
        expect(g.nodes.filter((n) => n.kind === 'destination').map((n) => n.label).sort()).toEqual(['1.1.1.1', '8.8.8.8'])

        const e = g.edges.find((x) => x.from.includes('chrome') && x.to.includes('1.1.1.1'))
        expect(e?.weight).toBe(2)
    })

    it('sets node weight to the sum of incident edge weights', () => {
        const g = buildFlowGraph(conns)
        const chrome = g.nodes.find((n) => n.id === 'p:chrome')
        expect(chrome?.weight).toBe(3)
        const google = g.nodes.find((n) => n.id === 'd:8.8.8.8')
        expect(google?.weight).toBe(2)
    })

    it('returns empty graph for empty input', () => {
        expect(buildFlowGraph([])).toEqual({ nodes: [], edges: [] })
    })
})

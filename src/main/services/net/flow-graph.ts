import type { FlowGraph, FlowNode, FlowEdge } from '../../../shared/types/m2'

interface FlowConnectionInput {
    processName: string
    remoteAddress: string
}

export function buildFlowGraph(connections: FlowConnectionInput[]): FlowGraph {
    if (connections.length === 0) {
        return { nodes: [], edges: [] }
    }

    // Keyed by [processId, destinationId] so a process name containing a space
    // or a "d:" can never be mis-split back into endpoints.
    const edgeWeights = new Map<string, number>()
    const processNames: string[] = []
    const destinationNames: string[] = []
    const seenProcesses = new Set<string>()
    const seenDestinations = new Set<string>()

    for (const conn of connections) {
        const proc = conn.processName.length > 0 ? conn.processName : 'unknown'
        const dest = conn.remoteAddress.length > 0 ? conn.remoteAddress : 'unknown'

        if (!seenProcesses.has(proc)) {
            seenProcesses.add(proc)
            processNames.push(proc)
        }
        if (!seenDestinations.has(dest)) {
            seenDestinations.add(dest)
            destinationNames.push(dest)
        }

        const key = `p:${proc}\0d:${dest}`
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1)
    }

    const nodeWeights = new Map<string, number>()
    const edges: FlowEdge[] = []

    for (const [key, weight] of edgeWeights) {
        const sep = key.indexOf('\0')
        const from = key.slice(0, sep)
        const to = key.slice(sep + 1)
        edges.push({ from, to, weight })
        nodeWeights.set(from, (nodeWeights.get(from) ?? 0) + weight)
        nodeWeights.set(to, (nodeWeights.get(to) ?? 0) + weight)
    }

    const nodes: FlowNode[] = []

    for (const name of processNames) {
        const id = `p:${name}`
        nodes.push({ id, label: name, kind: 'process', weight: nodeWeights.get(id) ?? 0 })
    }

    for (const name of destinationNames) {
        const id = `d:${name}`
        nodes.push({ id, label: name, kind: 'destination', weight: nodeWeights.get(id) ?? 0 })
    }

    return { nodes, edges }
}

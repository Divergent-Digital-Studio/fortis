import type { NetworkConnection } from '@shared/types/connection'
import type { FlowGraph } from '@shared/types/m2'
import type { FortisEventBus } from './event-bus'
import { buildFlowGraph } from './net/flow-graph'

interface FlowLocatorDeps {
    eventBus: FortisEventBus
    getConnections: () => NetworkConnection[]
}

export class FlowLocator {
    private readonly eventBus: FortisEventBus
    private readonly getConnections: () => NetworkConnection[]
    private current: FlowGraph = { nodes: [], edges: [] }

    constructor(deps: FlowLocatorDeps) {
        this.eventBus = deps.eventBus
        this.getConnections = deps.getConnections
    }

    getCurrent(): FlowGraph {
        return this.current
    }

    update(): FlowGraph {
        const connections = this.getConnections()
        this.current = buildFlowGraph(
            connections.map((c) => ({ processName: c.processName, remoteAddress: c.remoteAddress })),
        )
        this.eventBus.emit('flow:updated', { graph: this.current })
        return this.current
    }
}

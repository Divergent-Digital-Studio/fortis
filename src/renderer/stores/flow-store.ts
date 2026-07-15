import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { FlowGraph } from '@shared/types/m2';

interface FlowState {
    graph: FlowGraph;
}

interface FlowActions {
    setGraph: (graph: FlowGraph) => void;
}

type FlowStore = FlowState & FlowActions;

export const useFlowStore = create<FlowStore>()(
    subscribeWithSelector((set) => ({
        graph: { nodes: [], edges: [] },
        setGraph: (graph) => set({ graph }),
    })),
);

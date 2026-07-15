import type { AnonymizedPayload } from './analysis';

export type ReportGeneratedBy = 'ai' | 'local';
export type ReportExportFormat = 'json' | 'markdown' | 'html' | 'csv' | 'pdf';

export interface ReportProcessStat {
    name: string;
    count: number;
}

export interface ReportDestinationStat {
    address: string;
    country: string | null;
    count: number;
}

export interface WeeklyReport {
    id: string;
    generatedAt: number;
    periodStart: number;
    periodEnd: number;
    summary: string;
    healthScore: number | null;
    topProcesses: ReportProcessStat[];
    topDestinations: ReportDestinationStat[];
    threatCount: number;
    newDeviceCount: number;
    generatedBy: ReportGeneratedBy;
}

export interface AiPayloadView {
    current: AnonymizedPayload;
    lastSent: AnonymizedPayload | null;
}

export interface FlowNode {
    id: string;
    label: string;
    kind: 'process' | 'destination';
    weight: number;
}

export interface FlowEdge {
    from: string;
    to: string;
    weight: number;
}

export interface FlowGraph {
    nodes: FlowNode[];
    edges: FlowEdge[];
}

export interface OllamaConfig {
    endpoint: string;
    model: string;
}

export interface OllamaModelsResult {
    models: string[];
    available: boolean;
}

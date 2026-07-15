import type { ThreatLevel } from './analysis'

export type Role = 'admin' | 'manager' | 'observer'

export type Scope =
    | 'view'
    | 'manage-defense'
    | 'manage-settings'
    | 'manage-users'
    | 'manage-integrations'
    | 'export-reports'

export interface AppUser {
    id: string
    username: string
    role: Role
    createdAt: number
    disabled: boolean
}

export interface SessionInfo {
    token: string
    userId: string
    username: string
    role: Role
    expiresAt: number
}

export interface RestApiState {
    enabled: boolean
    listening: boolean
    host: string
    port: number
    error?: string
}

export type SiemVendor = 'splunk' | 'elastic' | 'datadog'

export interface SiemState {
    enabled: boolean
    configured: boolean
    verified: boolean
    vendor: SiemVendor
    severityFloor: ThreatLevel
}

export type ComplianceFramework = 'soc2' | 'iso27001' | 'pci' | 'hipaa' | 'gdpr'

export type ControlStatus = 'pass' | 'warn' | 'fail' | 'na'

export interface ComplianceControl {
    id: string
    title: string
    status: ControlStatus
    evidence: string
}

export interface ComplianceReport {
    framework: ComplianceFramework
    generatedAt: number
    orgName: string
    summary: { pass: number; warn: number; fail: number; na: number }
    controls: ComplianceControl[]
}

export interface InsiderThreatEvent {
    ts: number
    processName: string
    score: number
    factors: string[]
}

export interface InsiderThreatState {
    enabled: boolean
    recentEvents: InsiderThreatEvent[]
}

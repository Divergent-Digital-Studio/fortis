import type { Role, Scope } from '../../../shared/types/m6'

const ALL: Scope[] = ['view', 'manage-defense', 'manage-settings', 'manage-users', 'manage-integrations', 'export-reports']

export const ROLE_SCOPES: Record<Role, Set<Scope>> = {
    admin: new Set(ALL),
    manager: new Set<Scope>(['view', 'manage-defense', 'manage-settings', 'manage-integrations', 'export-reports']),
    observer: new Set<Scope>(['view']),
}

export function hasScope(role: Role, scope: Scope): boolean {
    return ROLE_SCOPES[role].has(scope)
}

const CHANNEL_SCOPES: Record<string, Scope> = {
    'users:list': 'manage-users',
    'users:create': 'manage-users',
    'users:set-disabled': 'manage-users',
    'users:delete': 'manage-users',
    'rest:set': 'manage-integrations',
    'siem:set': 'manage-integrations',
    'siem:test': 'manage-integrations',
    'compliance:generate': 'export-reports',
    'compliance:export-pdf': 'export-reports',
    'rbac:set-enabled': 'manage-users',
    'defense:kill-confirm': 'manage-defense',
    'defense:block-confirm': 'manage-defense',
    'defense:action-cancel': 'manage-defense',
    'rules:save': 'manage-defense',
    'rules:delete': 'manage-defense',
    'settings:update': 'manage-settings',
    'community:set-enabled': 'manage-integrations',
    'community:set-config': 'manage-integrations',
    'community:test': 'manage-integrations',
    'whitelist:export': 'export-reports',
    'reports:export': 'export-reports',
    'whitelist:add': 'manage-defense',
    'whitelist:remove': 'manage-defense',
    'whitelist:import': 'manage-defense',
    'alerts:acknowledge': 'manage-defense',
    'defense:unblock': 'manage-defense',
    'webhook:test': 'manage-integrations',
    'update:download': 'manage-settings',
    'update:install': 'manage-settings',
    'remote:set-enabled': 'manage-integrations',
    'pagerduty:set': 'manage-integrations',
    'pagerduty:test': 'manage-integrations',
    'scan:trigger': 'manage-defense',
    'monitor:pause': 'manage-defense',
    'monitor:resume': 'manage-defense',
    'ai:set-key': 'manage-settings',
    'ai:validate-key': 'manage-settings',
    // Device rename is a personal customisation (labelling a device), so any
    // viewer may do it — same level as reading the device list.
    'devices:rename': 'view',
}

const PUBLIC_CHANNELS = new Set<string>(['auth:login', 'app:version', 'app:platform', 'license:activate', 'license:status'])

export function requiredScopeFor(channel: string): Scope | null {
    if (PUBLIC_CHANNELS.has(channel)) return null
    return CHANNEL_SCOPES[channel] ?? 'view'
}

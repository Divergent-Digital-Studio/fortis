import { describe, it, expect } from 'vitest'
import { ROLE_SCOPES, hasScope, requiredScopeFor } from './role-scope'

describe('role-scope', () => {
    it('admin has every scope', () => {
        expect(hasScope('admin', 'manage-users')).toBe(true)
        expect(hasScope('admin', 'manage-integrations')).toBe(true)
        expect(hasScope('admin', 'view')).toBe(true)
    })
    it('observer can only view', () => {
        expect(hasScope('observer', 'view')).toBe(true)
        expect(hasScope('observer', 'manage-defense')).toBe(false)
        expect(hasScope('observer', 'manage-users')).toBe(false)
    })
    it('manager manages defense/integrations/exports but not users', () => {
        expect(hasScope('manager', 'manage-defense')).toBe(true)
        expect(hasScope('manager', 'manage-integrations')).toBe(true)
        expect(hasScope('manager', 'export-reports')).toBe(true)
        expect(hasScope('manager', 'manage-users')).toBe(false)
    })
    it('maps a channel to its required scope', () => {
        expect(requiredScopeFor('users:create')).toBe('manage-users')
        expect(requiredScopeFor('siem:set')).toBe('manage-integrations')
        expect(requiredScopeFor('connections:get')).toBe('view')
        expect(requiredScopeFor('auth:login')).toBe(null)
    })
    it('maps the real defense + rbac channel names (not stale aliases)', () => {
        expect(requiredScopeFor('defense:kill-confirm')).toBe('manage-defense')
        expect(requiredScopeFor('defense:block-confirm')).toBe('manage-defense')
        expect(requiredScopeFor('rbac:set-enabled')).toBe('manage-users')
        expect(requiredScopeFor('settings:update')).toBe('manage-settings')
    })
    it('an observer cannot reach any mutating channel scope', () => {
        const mutating = ['settings:update', 'defense:kill-confirm', 'rules:save', 'rbac:set-enabled', 'siem:set', 'users:create']
        for (const ch of mutating) {
            const scope = requiredScopeFor(ch)
            expect(scope && hasScope('observer', scope)).toBeFalsy()
        }
    })
    it('exposes the role scope map', () => {
        expect(ROLE_SCOPES.admin.size).toBeGreaterThan(ROLE_SCOPES.observer.size)
    })
})

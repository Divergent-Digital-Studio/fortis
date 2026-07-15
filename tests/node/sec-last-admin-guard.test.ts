import { describe, it, expect } from 'vitest'
import { SessionService } from '@main/services/session-service'
import { FortisEventBus } from '@main/services/event-bus'
import type { Role } from '@shared/types/m6'

interface Row {
    id: string
    username: string
    role: Role
    passwordHash: string
    salt: string
    createdAt: number
    disabled: boolean
}

function fakeDatabase(rows: Row[], rbacEnabled = true) {
    return {
        rows,
        rbacEnabled,
        countUsers: () => rows.length,
        listUsers: () => rows.map((r) => ({ id: r.id, username: r.username, role: r.role, createdAt: r.createdAt, disabled: r.disabled })),
        getUserById: (id: string) => rows.find((r) => r.id === id) ?? null,
        getUserByUsername: (u: string) => rows.find((r) => r.username === u) ?? null,
        setUserDisabled: (id: string, disabled: boolean) => {
            const r = rows.find((x) => x.id === id)
            if (r) r.disabled = disabled
        },
        deleteUser: (id: string) => {
            const i = rows.findIndex((x) => x.id === id)
            if (i >= 0) rows.splice(i, 1)
        },
        getSetting: (k: string) => (k === 'rbacEnabled' ? rbacEnabled : undefined),
    }
}

function user(id: string, role: Role, disabled = false): Row {
    return { id, username: id, role, passwordHash: 'h', salt: 's', createdAt: 1, disabled }
}

function serviceFor(rows: Row[], rbacEnabled = true) {
    const database = fakeDatabase(rows, rbacEnabled)
    const service = new SessionService({ database: database as never, eventBus: new FortisEventBus() as never })
    return { database, service }
}

describe('the last active admin cannot be removed or disabled while RBAC enforces', () => {
    it('refuses to delete the only active admin', () => {
        const { database, service } = serviceFor([user('root', 'admin'), user('obs', 'observer')])
        service.deleteUser('root')
        expect(database.rows.map((r) => r.id)).toEqual(['root', 'obs'])
    })

    it('refuses to disable the only active admin', () => {
        const { database, service } = serviceFor([user('root', 'admin')])
        service.setUserDisabled('root', true)
        expect(database.rows[0].disabled).toBe(false)
    })

    it('allows deleting an admin while another active admin remains', () => {
        const { database, service } = serviceFor([user('root', 'admin'), user('second', 'admin')])
        service.deleteUser('root')
        expect(database.rows.map((r) => r.id)).toEqual(['second'])
    })

    it('ignores disabled admins when counting the remaining ones', () => {
        const { database, service } = serviceFor([user('root', 'admin'), user('retired', 'admin', true)])
        service.deleteUser('root')
        expect(database.rows.map((r) => r.id)).toEqual(['root', 'retired'])
    })

    it('allows deleting a non-admin and re-enabling a disabled admin', () => {
        const { database, service } = serviceFor([user('root', 'admin'), user('obs', 'observer')])
        service.deleteUser('obs')
        expect(database.rows.map((r) => r.id)).toEqual(['root'])
        service.setUserDisabled('root', false)
        expect(database.rows[0].disabled).toBe(false)
    })
})

describe('with RBAC off there is nothing to be locked out of', () => {
    it('allows deleting the only admin', () => {
        const { database, service } = serviceFor([user('root', 'admin')], false)
        service.deleteUser('root')
        expect(database.rows).toEqual([])
    })

    it('allows disabling the only admin', () => {
        const { database, service } = serviceFor([user('root', 'admin')], false)
        service.setUserDisabled('root', true)
        expect(database.rows[0].disabled).toBe(true)
    })
})

import { randomUUID } from 'node:crypto'
import type { DatabaseService } from './database'
import type { FortisEventBus } from './event-bus'
import type { AppUser, Role, SessionInfo } from '../../shared/types/m6'
import { hashPassword, verifyPassword, generateToken } from './auth/password'

const SESSION_TTL_MS = 12 * 60 * 60 * 1000

interface SessionServiceDeps {
    database: DatabaseService
    eventBus: FortisEventBus
    now?: () => number
}

export class SessionService {
    private readonly now: () => number

    constructor(private readonly deps: SessionServiceDeps) {
        this.now = deps.now ?? (() => Date.now())
    }

    countUsers(): number {
        return this.deps.database.countUsers()
    }

    bootstrapAdmin(username: string, password: string): AppUser | null {
        if (this.deps.database.countUsers() > 0) return null
        return this.createUser(username, password, 'admin')
    }

    createUser(username: string, password: string, role: Role): AppUser | null {
        const trimmed = username.trim()
        if (trimmed.length === 0 || password.length < 6) return null
        if (this.deps.database.getUserByUsername(trimmed)) return null
        const { hash, salt } = hashPassword(password)
        const id = randomUUID()
        const createdAt = this.now()
        this.deps.database.createUser({ id, username: trimmed, role, passwordHash: hash, salt, createdAt })
        this.emitUsers()
        return { id, username: trimmed, role, createdAt, disabled: false }
    }

    login(username: string, password: string): SessionInfo | null {
        const user = this.deps.database.getUserByUsername(username.trim())
        if (!user || user.disabled) return null
        if (!verifyPassword(password, user.passwordHash, user.salt)) return null
        const token = generateToken()
        const createdAt = this.now()
        const expiresAt = createdAt + SESSION_TTL_MS
        this.deps.database.createSession({ token, userId: user.id, createdAt, expiresAt })
        return { token, userId: user.id, username: user.username, role: user.role, expiresAt }
    }

    resolve(token: string): { userId: string; role: Role } | null {
        if (typeof token !== 'string' || token.length === 0) return null
        const now = this.now()
        this.deps.database.deleteExpiredSessions(now)
        const session = this.deps.database.getSession(token)
        if (!session || session.expiresAt < now) return null
        const user = this.deps.database.getUserById(session.userId)
        if (!user || user.disabled) return null
        return { userId: user.id, role: user.role }
    }

    resolveSession(token: string): SessionInfo | null {
        const resolved = this.resolve(token)
        if (!resolved) return null
        const user = this.deps.database.getUserById(resolved.userId)
        const session = this.deps.database.getSession(token)
        if (!user || !session) return null
        return { token, userId: user.id, username: user.username, role: user.role, expiresAt: session.expiresAt }
    }

    logout(token: string): void {
        this.deps.database.deleteSession(token)
    }

    listUsers(): AppUser[] {
        return this.deps.database.listUsers()
    }

    setUserDisabled(id: string, disabled: boolean): AppUser[] {
        if (disabled && this.isProtectedAdmin(id)) return this.listUsers()
        this.deps.database.setUserDisabled(id, disabled)
        this.emitUsers()
        return this.listUsers()
    }

    deleteUser(id: string): AppUser[] {
        if (this.isProtectedAdmin(id)) return this.listUsers()
        this.deps.database.deleteUser(id)
        this.emitUsers()
        return this.listUsers()
    }

    /**
     * Removing the final usable admin locks everyone out — but only while RBAC is
     * enforcing. With RBAC off nothing is gated, and re-enabling it already requires
     * an active admin, so the account list stays freely editable.
     */
    private isProtectedAdmin(id: string): boolean {
        return this.isRbacActive() && this.isLastActiveAdmin(id)
    }

    private isLastActiveAdmin(id: string): boolean {
        const others = this.listUsers().filter((u) => u.id !== id && u.role === 'admin' && !u.disabled)
        if (others.length > 0) return false
        const target = this.deps.database.getUserById(id)
        return target?.role === 'admin' && !target.disabled
    }

    isRbacActive(): boolean {
        return this.deps.database.getSetting('rbacEnabled') === true && this.deps.database.countUsers() > 0
    }

    private emitUsers(): void {
        this.deps.eventBus.emit('users:changed', { users: this.listUsers() })
    }
}

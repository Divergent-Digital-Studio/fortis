import { useCallback, useId, useMemo, useState } from 'react';
import { Lock, Users, UserPlus, ShieldCheck, LogOut, Settings, Trash2, X } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Select from '../common/Select';
import EmptyState from '../common/EmptyState';
import DataTable from '../common/DataTable';
import { ConfirmDialog } from '../common/ConfirmDialog';
import useAdmin from '../../hooks/useAdmin';
import useSettings from '../../hooks/useSettings';
import { useI18n } from '../../i18n';
import { useUIStore } from '../../stores/ui-store';
import type { AppUser, Role } from '@shared/types/m6';
import '../../styles/components/settings.css';
import '../../styles/components/admin-view.css';

const ROLE_OPTIONS: ReadonlyArray<{ value: Role; labelKey: string }> = [
    { value: 'admin', labelKey: 'admin.role.admin' },
    { value: 'manager', labelKey: 'admin.role.manager' },
    { value: 'observer', labelKey: 'admin.role.observer' },
];

const MIN_PASSWORD_LENGTH = 6;

function AdminView() {
    const { t } = useI18n();
    const { settings } = useSettings();
    const { session, users, error, dismissError, login, logout, createUser, setUserDisabled, deleteUser } = useAdmin();
    const setActiveView = useUIStore((s) => s.setActiveView);

    const loginUserId = useId();
    const loginPassId = useId();
    const createUserId = useId();
    const createPassId = useId();

    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState(false);

    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<Role>('observer');
    const [createError, setCreateError] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<AppUser | null>(null);

    // Mirrors SessionService.isProtectedAdmin: while RBAC enforces, the main process
    // refuses to disable or delete the final usable admin, so don't offer the action.
    const isProtectedAdmin = useCallback(
        (u: AppUser) =>
            settings.rbacEnabled &&
            u.role === 'admin' &&
            !u.disabled &&
            users.filter((o) => o.role === 'admin' && !o.disabled).length === 1,
        [settings.rbacEnabled, users],
    );

    const handleLogin = useCallback(async () => {
        const ok = await login(loginUsername.trim(), loginPassword);
        if (ok) {
            setLoginUsername('');
            setLoginPassword('');
            setLoginError(false);
        } else {
            setLoginError(true);
        }
    }, [login, loginUsername, loginPassword]);

    const handleCreate = useCallback(async () => {
        const username = newUsername.trim();
        if (username.length === 0) return;
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            setCreateError(t('admin.create.passwordTooShort', { min: MIN_PASSWORD_LENGTH }));
            return;
        }
        const created = await createUser({ username, password: newPassword, role: newRole });
        if (!created) {
            setCreateError(t('admin.create.failed', { username }));
            return;
        }
        setCreateError(null);
        setNewUsername('');
        setNewPassword('');
        setNewRole('observer');
    }, [createUser, newUsername, newPassword, newRole, t]);

    const handleConfirmDelete = useCallback(async () => {
        if (!pendingDelete) return;
        const isSelf = pendingDelete.id === session?.userId;
        await deleteUser(pendingDelete.id);
        setPendingDelete(null);
        // Deleting your own account revokes its sessions server-side.
        if (isSelf) await logout();
    }, [pendingDelete, session, deleteUser, logout]);

    const columns = useMemo(
        () => [
            {
                key: 'username',
                header: t('admin.login.username'),
                sortValue: (u: AppUser) => u.username,
                render: (u: AppUser) => u.username,
            },
            {
                key: 'role',
                header: t('admin.create.role'),
                width: '0.6fr',
                sortValue: (u: AppUser) => u.role,
                render: (u: AppUser) => <Badge variant="neutral">{t(`admin.role.${u.role}`)}</Badge>,
            },
            {
                key: 'created',
                header: t('admin.col.created'),
                width: '0.8fr',
                sortValue: (u: AppUser) => u.createdAt,
                render: (u: AppUser) => new Date(u.createdAt).toLocaleDateString(),
            },
            {
                key: 'status',
                header: t('admin.col.status'),
                width: '0.6fr',
                sortValue: (u: AppUser) => (u.disabled ? 'Disabled' : 'Active'),
                render: (u: AppUser) => (
                    <Badge variant={u.disabled ? 'neutral' : 'safe'}>
                        {u.disabled ? t('common.disabled') : t('admin.users.active')}
                    </Badge>
                ),
            },
            {
                key: 'action',
                header: t('admin.col.actions'),
                width: '0.9fr',
                render: (u: AppUser) => {
                    const locked = isProtectedAdmin(u);
                    const title = locked ? t('admin.users.protectedAdmin') : undefined;
                    return (
                        <div className="admin-row-actions">
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={locked}
                                title={title}
                                onClick={() => void setUserDisabled(u.id, !u.disabled)}
                            >
                                {u.disabled ? t('admin.users.enable') : t('admin.users.disable')}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={Trash2}
                                disabled={locked}
                                title={title}
                                aria-label={t('admin.users.deleteAria', { username: u.username })}
                                onClick={() => setPendingDelete(u)}
                            >
                                {t('admin.users.delete')}
                            </Button>
                        </div>
                    );
                },
            },
        ],
        [isProtectedAdmin, setUserDisabled, t],
    );

    if (settings.tier !== 'enterprise') {
        return (
            <div className="admin-view">
                <Card>
                    <EmptyState
                        icon={Lock}
                        title={t('admin.gate.title')}
                        message={t('admin.gate.message')}
                        action={
                            <Button variant="primary" size="sm" icon={Settings} onClick={() => setActiveView('settings')}>
                                {t('admin.gate.openSettings')}
                            </Button>
                        }
                    />
                </Card>
            </div>
        );
    }

    if (settings.rbacEnabled && !session) {
        return (
            <div className="admin-view">
                <Card
                    header={
                        <div className="settings-section__header">
                            <ShieldCheck size={18} strokeWidth={1.5} className="settings-section__icon" />
                            <span className="settings-section__title">{t('admin.login.signIn')}</span>
                        </div>
                    }
                >
                    <div className="admin-form">
                        <div className="admin-form__row">
                            <label htmlFor={loginUserId} className="settings-field__label">{t('admin.login.username')}</label>
                            <input
                                id={loginUserId}
                                type="text"
                                className="settings-input"
                                value={loginUsername}
                                onChange={(e) => setLoginUsername(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && void handleLogin()}
                                autoComplete="username"
                                spellCheck={false}
                            />
                        </div>
                        <div className="admin-form__row">
                            <label htmlFor={loginPassId} className="settings-field__label">{t('admin.login.password')}</label>
                            <input
                                id={loginPassId}
                                type="password"
                                className="settings-input"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && void handleLogin()}
                                autoComplete="current-password"
                                spellCheck={false}
                            />
                        </div>
                        {loginError && <p className="admin-error" role="alert">{t('admin.login.invalid')}</p>}
                        <div className="admin-form__actions">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleLogin}
                                disabled={loginUsername.trim().length === 0 || loginPassword.length === 0}
                            >
                                {t('admin.login.signIn')}
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="admin-view">
            {error && (
                <div className="admin-error" role="alert">
                    <span>{t('admin.error.loadUsersFailed', { message: error })}</span>
                    <Button variant="ghost" size="sm" icon={X} onClick={dismissError} aria-label={t('common.dismiss')}>
                        {t('common.dismiss')}
                    </Button>
                </div>
            )}
            <Card
                header={
                    <div className="settings-section__header">
                        <Users size={18} strokeWidth={1.5} className="settings-section__icon" />
                        <span className="settings-section__title">{t('admin.users.title')}</span>
                    </div>
                }
                headerActions={
                    session ? (
                        <div className="admin-session">
                            <Badge variant="safe">{session.username} · {t(`admin.role.${session.role}`)}</Badge>
                            <Button variant="secondary" size="sm" icon={LogOut} onClick={() => void logout()}>
                                {t('admin.users.signOut')}
                            </Button>
                        </div>
                    ) : (
                        <Badge variant="neutral">{t('admin.users.accessControlOff')}</Badge>
                    )
                }
                flush
            >
                <DataTable
                    rows={users}
                    columns={columns}
                    rowKey={(u) => u.id}
                    label={t('admin.users.tableAria')}
                    emptyMessage={t('admin.users.empty')}
                />
            </Card>

            <Card
                header={
                    <div className="settings-section__header">
                        <UserPlus size={18} strokeWidth={1.5} className="settings-section__icon" />
                        <span className="settings-section__title">{t('admin.create.title')}</span>
                    </div>
                }
            >
                <div className="admin-form">
                    <div className="admin-form__row">
                        <label htmlFor={createUserId} className="settings-field__label">{t('admin.login.username')}</label>
                        <input
                            id={createUserId}
                            type="text"
                            className="settings-input"
                            value={newUsername}
                            onChange={(e) => {
                                setNewUsername(e.target.value);
                                setCreateError(null);
                            }}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                    <div className="admin-form__row">
                        <label htmlFor={createPassId} className="settings-field__label">{t('admin.login.password')}</label>
                        <input
                            id={createPassId}
                            type="password"
                            className="settings-input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            autoComplete="new-password"
                            spellCheck={false}
                        />
                        <span className="settings-field__hint">{t('admin.create.passwordHint', { min: MIN_PASSWORD_LENGTH })}</span>
                    </div>
                    <div className="admin-form__row">
                        <label className="settings-field__label">{t('admin.create.role')}</label>
                        <Select
                            value={newRole}
                            options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                            onChange={setNewRole}
                            ariaLabel={t('admin.create.roleAria')}
                        />
                    </div>
                    {createError && <p className="admin-error" role="alert">{createError}</p>}
                    <div className="admin-form__actions">
                        <Button
                            variant="primary"
                            size="sm"
                            icon={UserPlus}
                            onClick={handleCreate}
                            disabled={newUsername.trim().length === 0 || newPassword.length === 0}
                        >
                            {t('admin.create.submit')}
                        </Button>
                    </div>
                </div>
            </Card>

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                title={t('admin.delete.title')}
                message={
                    pendingDelete
                        ? t('admin.delete.message', { username: pendingDelete.username })
                        : ''
                }
                confirmLabel={t('admin.users.delete')}
                destructive
                onConfirm={() => void handleConfirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
}

export default AdminView;

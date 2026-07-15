import { useEffect, useCallback, useState } from 'react';
import { useAdminStore } from '../stores/admin-store';
import type { AppUser, Role, SessionInfo } from '@shared/types/m6';

interface UseAdminResult {
    session: SessionInfo | null;
    users: AppUser[];
    error: string | null;
    dismissError: () => void;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    createUser: (input: { username: string; password: string; role: Role }) => Promise<boolean>;
    setUserDisabled: (id: string, disabled: boolean) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
}

function useAdmin(): UseAdminResult {
    const session = useAdminStore((s) => s.session);
    const users = useAdminStore((s) => s.users);
    const setSession = useAdminStore((s) => s.setSession);
    const setUsers = useAdminStore((s) => s.setUsers);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        window.fortis
            .listUsers(useAdminStore.getState().session?.token ?? '')
            .then((u) => {
                if (active) setUsers(u);
            })
            .catch((err: unknown) => {
                if (active) setError(err instanceof Error ? err.message : String(err));
            });
        const offUsers = window.fortis.onUsersChanged((u: AppUser[]) => setUsers(u));
        return () => {
            active = false;
            offUsers();
        };
    }, [setUsers]);

    const login = useCallback(
        async (username: string, password: string) => {
            const result = await window.fortis.login(username, password);
            if (!result) return false;
            setSession(result);
            setError(null);
            const next = await window.fortis.listUsers(result.token);
            setUsers(next);
            return true;
        },
        [setSession, setUsers],
    );

    const logout = useCallback(async () => {
        if (session) {
            await window.fortis.logout(session.token);
        }
        setSession(null);
        setUsers([]);
    }, [session, setSession, setUsers]);

    const createUser = useCallback(
        async (input: { username: string; password: string; role: Role }) => {
            const before = useAdminStore.getState().users.length;
            const next = await window.fortis.createUser(session?.token ?? '', input);
            setUsers(next);
            return next.length > before;
        },
        [session, setUsers],
    );

    const setUserDisabled = useCallback(
        async (id: string, disabled: boolean) => {
            const next = await window.fortis.setUserDisabled(session?.token ?? '', id, disabled);
            setUsers(next);
        },
        [session, setUsers],
    );

    const deleteUser = useCallback(
        async (id: string) => {
            setUsers(await window.fortis.deleteUser(session?.token ?? '', id));
        },
        [session, setUsers],
    );

    const dismissError = useCallback(() => setError(null), []);

    return { session, users, error, dismissError, login, logout, createUser, setUserDisabled, deleteUser };
}

export default useAdmin;
export type { UseAdminResult };

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppUser, SessionInfo } from '@shared/types/m6';

interface AdminState {
    session: SessionInfo | null;
    users: AppUser[];
}
interface AdminActions {
    setSession: (s: SessionInfo | null) => void;
    setUsers: (u: AppUser[]) => void;
}
type AdminStore = AdminState & AdminActions;

export const useAdminStore = create<AdminStore>()(
    subscribeWithSelector((set) => ({
        session: null,
        users: [],
        setSession: (session) => set({ session }),
        setUsers: (users) => set({ users }),
    })),
);

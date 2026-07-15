import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { DefenseAction, BlockedIp, CustomRule, TlsCertInfo } from '@shared/types/m3';

interface DefenseState {
    actions: DefenseAction[];
    blockedIps: BlockedIp[];
    rules: CustomRule[];
    certs: TlsCertInfo[];
    error: string | null;
}

interface DefenseActions {
    setActions: (actions: DefenseAction[]) => void;
    setBlockedIps: (blockedIps: BlockedIp[]) => void;
    setRules: (rules: CustomRule[]) => void;
    setCerts: (certs: TlsCertInfo[]) => void;
    setError: (error: string | null) => void;
    setAll: (state: Omit<DefenseState, 'error'>) => void;
}

type DefenseStore = DefenseState & DefenseActions;

export const useDefenseStore = create<DefenseStore>()(
    subscribeWithSelector((set) => ({
        actions: [],
        blockedIps: [],
        rules: [],
        certs: [],
        error: null,
        setActions: (actions) => set({ actions }),
        setBlockedIps: (blockedIps) => set({ blockedIps }),
        setRules: (rules) => set({ rules }),
        setCerts: (certs) => set({ certs }),
        setError: (error) => set({ error }),
        setAll: (state) => set(state),
    })),
);

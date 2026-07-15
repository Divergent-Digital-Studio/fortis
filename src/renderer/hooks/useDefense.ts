import { useState, useEffect, useCallback, useRef } from 'react';
import { useDefenseStore } from '../stores/defense-store';
import type { CustomRule } from '@shared/types/m3';

interface UseDefenseResult {
    actions: ReturnType<typeof useDefenseStore.getState>['actions'];
    blockedIps: ReturnType<typeof useDefenseStore.getState>['blockedIps'];
    rules: CustomRule[];
    certs: ReturnType<typeof useDefenseStore.getState>['certs'];
    saveRule: (rule: CustomRule) => Promise<void>;
    deleteRule: (id: string) => Promise<void>;
    confirmKill: (actionId: string) => Promise<void>;
    confirmBlock: (actionId: string) => Promise<void>;
    cancelAction: (actionId: string) => Promise<void>;
    unblockIp: (ip: string) => Promise<void>;
}

interface UseDefenseSyncResult {
    isLoading: boolean;
    error: string | null;
    dismissError: () => void;
    refresh: () => Promise<void>;
}

function message(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
}

// ponytail: error is store-level so any tab's failed mutation surfaces in the
// one banner DefenseView renders, without threading callbacks through tabs.
function useDefenseSync(): UseDefenseSyncResult {
    const [isLoading, setIsLoading] = useState(true);
    const error = useDefenseStore((s) => s.error);
    const setError = useDefenseStore((s) => s.setError);
    const setAll = useDefenseStore((s) => s.setAll);
    const setActions = useDefenseStore((s) => s.setActions);
    const setCerts = useDefenseStore((s) => s.setCerts);

    // actions and certs also arrive by push. An event landing mid-fetch is newer
    // than the snapshot the fetch is about to resolve with, so drop just those two
    // slices — rules and blockedIps have no push channel and must always land.
    const pushed = useRef(0);

    const fetchAll = useCallback(async () => {
        const started = pushed.current;
        try {
            setIsLoading(true);
            setError(null);
            const [actions, blockedIps, rules, certs] = await Promise.all([
                window.fortis.getDefenseActions(),
                window.fortis.getBlockedIps(),
                window.fortis.getRules(),
                window.fortis.getCerts(),
            ]);
            const stale = pushed.current !== started;
            const current = useDefenseStore.getState();
            setAll({
                actions: stale ? current.actions : actions,
                certs: stale ? current.certs : certs,
                blockedIps,
                rules,
            });
        } catch (err) {
            setError(message(err, 'Failed to load defense data'));
        } finally {
            setIsLoading(false);
        }
    }, [setAll, setError]);

    useEffect(() => {
        const unsubscribeActions = window.fortis.onDefenseActionsUpdate((actions) => {
            pushed.current += 1;
            setActions(actions);
        });
        const unsubscribeCerts = window.fortis.onCertsUpdate((certs) => {
            pushed.current += 1;
            setCerts(certs);
        });
        void fetchAll();
        return () => {
            unsubscribeActions();
            unsubscribeCerts();
        };
    }, [fetchAll, setActions, setCerts]);

    return { isLoading, error, dismissError: () => setError(null), refresh: fetchAll };
}

function useDefense(): UseDefenseResult {
    const actions = useDefenseStore((s) => s.actions);
    const blockedIps = useDefenseStore((s) => s.blockedIps);
    const rules = useDefenseStore((s) => s.rules);
    const certs = useDefenseStore((s) => s.certs);
    const setActions = useDefenseStore((s) => s.setActions);
    const setBlockedIps = useDefenseStore((s) => s.setBlockedIps);
    const setRules = useDefenseStore((s) => s.setRules);
    const setError = useDefenseStore((s) => s.setError);

    const saveRule = useCallback(async (rule: CustomRule) => {
        try {
            setError(null);
            setRules(await window.fortis.saveRule(rule));
        } catch (err) {
            setError(message(err, 'Failed to save rule'));
        }
    }, [setRules, setError]);

    const deleteRule = useCallback(async (id: string) => {
        try {
            setError(null);
            setRules(await window.fortis.deleteRule(id));
        } catch (err) {
            setError(message(err, 'Failed to delete rule'));
        }
    }, [setRules, setError]);

    const confirmKill = useCallback(async (actionId: string) => {
        try {
            setError(null);
            setActions(await window.fortis.confirmKill(actionId));
        } catch (err) {
            setError(message(err, 'Failed to confirm kill'));
        }
    }, [setActions, setError]);

    const confirmBlock = useCallback(async (actionId: string) => {
        try {
            setError(null);
            setActions(await window.fortis.confirmBlock(actionId));
        } catch (err) {
            setError(message(err, 'Failed to confirm block'));
        }
    }, [setActions, setError]);

    const cancelAction = useCallback(async (actionId: string) => {
        try {
            setError(null);
            setActions(await window.fortis.cancelDefenseAction(actionId));
        } catch (err) {
            setError(message(err, 'Failed to cancel action'));
        }
    }, [setActions, setError]);

    const unblockIp = useCallback(async (ip: string) => {
        try {
            setError(null);
            setBlockedIps(await window.fortis.unblockIp(ip));
        } catch (err) {
            setError(message(err, 'Failed to unblock IP'));
        }
    }, [setBlockedIps, setError]);

    return {
        actions,
        blockedIps,
        rules,
        certs,
        saveRule,
        deleteRule,
        confirmKill,
        confirmBlock,
        cancelAction,
        unblockIp,
    };
}

export default useDefense;
export { useDefenseSync };
export type { UseDefenseResult, UseDefenseSyncResult };

import { useEffect, useCallback } from 'react';
import { useLicenseStore } from '../stores/license-store';
import type { LicenseStatus } from '@shared/types/settings';
import { PURCHASE_URL } from '../stores/license-defaults';

interface UseLicenseResult {
    status: LicenseStatus;
    activate: (licenseKey: string) => Promise<{ success: boolean; error?: string }>;
    openPurchase: () => void;
}

function useLicense(): UseLicenseResult {
    const status = useLicenseStore((s) => s.status);
    const setStatus = useLicenseStore((s) => s.setStatus);

    useEffect(() => {
        let active = true;
        const api = window.fortis;
        if (typeof api.getLicenseStatus === 'function') {
            api.getLicenseStatus()
                .then((s) => {
                    if (active) setStatus(s);
                })
                .catch(() => undefined);
        }
        let off: (() => void) | null = null;
        if (typeof api.onLicenseChanged === 'function') {
            off = api.onLicenseChanged((s: LicenseStatus) => setStatus(s));
        }
        return () => {
            active = false;
            if (off) off();
        };
    }, [setStatus]);

    const activate = useCallback(
        async (licenseKey: string) => {
            const result = await window.fortis.activateLicense(licenseKey);
            setStatus(result.status);
            const out: { success: boolean; error?: string } = { success: result.success };
            if (result.error) out.error = result.error;
            return out;
        },
        [setStatus],
    );

    const openPurchase = useCallback(() => {
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
            window.open(PURCHASE_URL, '_blank', 'noopener,noreferrer');
        }
    }, []);

    return { status, activate, openPurchase };
}

export default useLicense;
export type { UseLicenseResult };

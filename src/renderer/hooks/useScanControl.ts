import { useState, useCallback, useEffect, useRef } from 'react';
import type { MonitorStatus } from '../types';

interface UseScanControlResult {
    monitoringStatus: MonitorStatus | null;
    isScanning: boolean;
    isPausing: boolean;
    isResuming: boolean;
    triggerScan: () => Promise<void>;
    pauseMonitoring: () => Promise<void>;
    resumeMonitoring: () => Promise<void>;
    refreshStatus: () => Promise<void>;
}

const STATUS_POLL_INTERVAL = 3000;

function useScanControl(): UseScanControlResult {
    const [monitoringStatus, setMonitoringStatus] = useState<MonitorStatus | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isPausing, setIsPausing] = useState(false);
    const [isResuming, setIsResuming] = useState(false);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refreshStatus = useCallback(async () => {
        try {
            const status = await window.fortis.getMonitoringStatus();
            setMonitoringStatus(status);
        } catch {
            // keep last known status on failure
        }
    }, []);

    useEffect(() => {
        refreshStatus();

        pollTimerRef.current = setInterval(refreshStatus, STATUS_POLL_INTERVAL);

        return () => {
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
    }, [refreshStatus]);

    const triggerScan = useCallback(async () => {
        try {
            setIsScanning(true);
            await window.fortis.triggerScan();
            await refreshStatus();
        } catch {
            // scan failure handled silently
        } finally {
            setIsScanning(false);
        }
    }, [refreshStatus]);

    const pauseMonitoring = useCallback(async () => {
        try {
            setIsPausing(true);
            await window.fortis.pauseMonitoring();
            await refreshStatus();
        } catch {
            // pause failure handled silently
        } finally {
            setIsPausing(false);
        }
    }, [refreshStatus]);

    const resumeMonitoring = useCallback(async () => {
        try {
            setIsResuming(true);
            await window.fortis.resumeMonitoring();
            await refreshStatus();
        } catch {
            // resume failure handled silently
        } finally {
            setIsResuming(false);
        }
    }, [refreshStatus]);

    return {
        monitoringStatus,
        isScanning,
        isPausing,
        isResuming,
        triggerScan,
        pauseMonitoring,
        resumeMonitoring,
        refreshStatus,
    };
}

export default useScanControl;
export type { UseScanControlResult };

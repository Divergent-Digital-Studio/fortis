import { lazy, Suspense, useCallback, useEffect } from 'react';
import { useUIStore, useAlertStore } from './stores';
import { useConnectionStore } from './stores/connection-store';
import { AppShell } from './components/layout';
import { OnboardingWizard } from './components/onboarding';
import { LoadingSkeleton, LicenseDialog } from './components/common';
import useScanControl from './hooks/useScanControl';
import useAIStatus from './hooks/useAIStatus';
import useTheme from './hooks/useTheme';
import type { StatusMode } from './components/layout/Header';
import type { ViewType } from './types';
import './styles/components/app.css';
import './styles/components/view-transition.css';

const OverviewView = lazy(() => import('./components/dashboard/OverviewView'));
const ConnectionsView = lazy(() => import('./components/connections/ConnectionsView'));
const SettingsView = lazy(() => import('./components/settings/SettingsView'));
const AlertsView = lazy(() => import('./components/alerts/AlertsView'));
const DevicesView = lazy(() => import('./components/devices/DevicesView'));
const DnsView = lazy(() => import('./components/dns/DnsView'));
const GeoMapView = lazy(() => import('./components/geo/GeoMapView'));
const IotView = lazy(() => import('./components/iot/IotView'));
const ReportsView = lazy(() => import('./components/reports/ReportsView'));
const FlowView = lazy(() => import('./components/flow/FlowView'));
const DefenseView = lazy(() => import('./components/defense/DefenseView'));
const BandwidthView = lazy(() => import('./components/bandwidth/BandwidthView'));
const RemoteView = lazy(() => import('./components/remote/RemoteView'));
const AdminView = lazy(() => import('./components/admin/AdminView'));
const CommunityView = lazy(() => import('./components/community/CommunityView'));

function ViewSuspenseFallback() {
    return (
        <div className="view-suspense-fallback">
            <LoadingSkeleton height={72} shape="rounded" />
            <LoadingSkeleton height={300} shape="rounded" />
            <LoadingSkeleton height={200} shape="rounded" />
        </div>
    );
}

function deriveStatusMode(
    monitoringStatus: { isRunning: boolean; isPaused: boolean } | null,
    isScanning: boolean,
    scanStatus: string,
): StatusMode {
    if (isScanning || scanStatus === 'scanning') return 'scanning';
    if (!monitoringStatus) return 'stopped';
    if (monitoringStatus.isPaused) return 'paused';
    if (monitoringStatus.isRunning) return 'active';
    return 'stopped';
}

function renderView(view: ViewType) {
    switch (view) {
        case 'overview':
            return <OverviewView />;
        case 'connections':
            return <ConnectionsView />;
        case 'settings':
            return <SettingsView />;
        case 'alerts':
            return <AlertsView />;
        case 'devices':
            return <DevicesView />;
        case 'dns':
            return <DnsView />;
        case 'geo':
            return <GeoMapView />;
        case 'iot':
            return <IotView />;
        case 'reports':
            return <ReportsView />;
        case 'flow':
            return <FlowView />;
        case 'defense':
            return <DefenseView />;
        case 'bandwidth':
            return <BandwidthView />;
        case 'remote':
            return <RemoteView />;
        case 'admin':
            return <AdminView />;
        case 'community':
            return <CommunityView />;
        default:
            return null;
    }
}

function App() {
    const activeView = useUIStore((state) => state.activeView);
    const { monitoringStatus, isScanning, triggerScan } = useScanControl();
    const setActiveView = useUIStore((state) => state.setActiveView);
    const licenseDialogOpen = useUIStore((state) => state.licenseDialogOpen);
    const setLicenseDialogOpen = useUIStore((state) => state.setLicenseDialogOpen);
    const setLastScanTimestamp = useConnectionStore((s) => s.setLastScanTimestamp);
    const setScanStatus = useConnectionStore((s) => s.setScanStatus);
    const scanStatus = useConnectionStore((s) => s.scanStatus);
    const initGlobalSubscriptions = useConnectionStore((s) => s.initGlobalSubscriptions);
    const initAlertSubscriptions = useAlertStore((s) => s.initAlertSubscriptions);
    const { refresh: refreshAIStatus } = useAIStatus();
    useTheme();

    const statusMode = deriveStatusMode(monitoringStatus, isScanning, scanStatus);

    useEffect(() => {
        const unsubscribe = window.fortis.onNavigateTo((view: string) => {
            const validViews: ViewType[] = ['overview', 'connections', 'alerts', 'settings', 'devices', 'dns', 'geo', 'iot', 'reports', 'flow', 'defense', 'bandwidth', 'remote', 'admin', 'community'];
            if (validViews.includes(view as ViewType)) {
                setActiveView(view as ViewType);
            }
        });
        return unsubscribe;
    }, [setActiveView]);

    useEffect(() => {
        const unsub = initGlobalSubscriptions();
        return unsub;
    }, [initGlobalSubscriptions]);

    useEffect(() => {
        const unsub = initAlertSubscriptions();
        return unsub;
    }, [initAlertSubscriptions]);

    const handleScanNow = useCallback(async () => {
        setScanStatus('scanning');
        try {
            await triggerScan();
            await window.fortis.triggerAIAnalysis();
            setScanStatus('idle');
            await refreshAIStatus();
        } catch (err) {
            console.error('Scan failed:', err);
            setScanStatus('error');
        } finally {
            setLastScanTimestamp(Date.now());
        }
    }, [triggerScan, setLastScanTimestamp, setScanStatus, refreshAIStatus]);

    const handleUpgrade = useCallback(() => {
        setLicenseDialogOpen(true);
    }, [setLicenseDialogOpen]);

    return (
        <>
            <AppShell statusMode={statusMode} onScanNow={handleScanNow} onUpgrade={handleUpgrade}>
                <Suspense fallback={<ViewSuspenseFallback />}>
                    <div className="view-container" key={activeView}>
                        {renderView(activeView)}
                    </div>
                </Suspense>
            </AppShell>
            <OnboardingWizard />
            <LicenseDialog isOpen={licenseDialogOpen} onClose={() => setLicenseDialogOpen(false)} />
        </>
    );
}

export default App;

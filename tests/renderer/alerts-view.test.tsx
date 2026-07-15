import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertsView from '@renderer/components/alerts/AlertsView';
import { useAlertStore } from '@renderer/stores/alert-store';
import type { Alert } from '@shared/types/alert';

function makeAlert(over: Partial<Alert> = {}): Alert {
    return {
        id: 'a1',
        timestamp: Date.now(),
        type: 'rule_based',
        threatLevel: 'danger',
        title: 'Suspicious outbound',
        description: 'desc',
        connectionId: 'c1',
        recommendation: '',
        source: 'rule_engine',
        acknowledged: false,
        whitelisted: false,
        dedupKey: 'k1',
        suppressedCount: 0,
        createdAt: Date.now(),
        ...over,
    };
}

interface Mocks {
    getAlerts: ReturnType<typeof vi.fn>;
    getRecentAlerts: ReturnType<typeof vi.fn>;
    acknowledgeAlert: ReturnType<typeof vi.fn>;
    addToWhitelist: ReturnType<typeof vi.fn>;
    getAlertCounts: ReturnType<typeof vi.fn>;
    emitWhitelistUpdate: () => void;
}

function installFortis(alerts: Alert[]): Mocks {
    let whitelistListener: (() => void) | null = null;

    const mocks = {
        getAlerts: vi.fn(async () => alerts),
        getRecentAlerts: vi.fn(async () => alerts),
        acknowledgeAlert: vi.fn(async () => true),
        addToWhitelist: vi.fn(async () => 'wl1'),
        getAlertCounts: vi.fn(async () => ({
            total: alerts.length,
            critical: 0,
            danger: alerts.length,
            warning: 0,
            info: 0,
            unacknowledged: alerts.length,
        })),
        emitWhitelistUpdate: () => whitelistListener?.(),
    };

    (window as unknown as { fortis: Record<string, unknown> }).fortis = {
        ...mocks,
        onNewAlert: () => () => {},
        onAnalysisUpdate: () => () => {},
        getWhitelist: async () => [],
        onWhitelistUpdate: (cb: () => void) => {
            whitelistListener = cb;
            return () => {
                whitelistListener = null;
            };
        },
    };

    return mocks;
}

function resetStore(alerts: Alert[]): void {
    useAlertStore.setState({
        alerts,
        dismissedIds: new Set<string>(),
        filters: {},
        loading: false,
        error: null,
        sortOrder: 'newest',
    });
}

afterEach(() => {
    vi.useRealTimers();
});

describe('AlertsView integration', () => {
    beforeEach(() => {
        resetStore([makeAlert()]);
    });

    it('requests the full page size instead of the backend default', async () => {
        const m = installFortis([makeAlert()]);
        render(<AlertsView />);

        await waitFor(() => expect(m.getRecentAlerts).toHaveBeenCalled());
        expect(m.getRecentAlerts).toHaveBeenCalledWith(200);
    });

    it('carries a limit into filtered fetches so a filter cannot silently truncate', async () => {
        const m = installFortis([makeAlert()]);
        render(<AlertsView />);

        await userEvent.click(await screen.findByRole('button', { name: /^Critical/ }));

        await waitFor(() => expect(m.getAlerts).toHaveBeenCalled());
        expect(m.getAlerts.mock.calls[0]![0]).toMatchObject({
            limit: 200,
            threatLevel: 'critical',
        });
    });

    it('refreshes counts after a filtered fetch', async () => {
        const m = installFortis([makeAlert()]);
        render(<AlertsView />);
        await waitFor(() => expect(m.getAlertCounts).toHaveBeenCalled());
        m.getAlertCounts.mockClear();

        await userEvent.click(await screen.findByRole('button', { name: /^Warning/ }));

        await waitFor(() => expect(m.getAlertCounts).toHaveBeenCalled());
    });

    it('surfaces an acknowledge failure instead of swallowing it', async () => {
        const m = installFortis([makeAlert()]);
        m.acknowledgeAlert.mockRejectedValue(
            new Error("Error invoking remote method 'alerts:acknowledge': Error: FORBIDDEN: role viewer lacks scope"),
        );
        render(<AlertsView />);

        await userEvent.click(await screen.findByRole('button', { name: /Acknowledge/ }));

        const banner = await screen.findByRole('alert');
        expect(banner).toHaveTextContent('FORBIDDEN: role viewer lacks scope');
        expect(banner).not.toHaveTextContent('invoking remote method');
    });

    it('refetches alerts when the whitelist changes so sibling alerts pick up the flag', async () => {
        const m = installFortis([makeAlert()]);
        render(<AlertsView />);
        await waitFor(() => expect(m.getRecentAlerts).toHaveBeenCalled());
        expect(m.getAlerts).not.toHaveBeenCalled();

        act(() => m.emitWhitelistUpdate());

        await waitFor(() => expect(m.getAlerts).toHaveBeenCalled());
    });

    it('ticks the relative timestamp without a refetch', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const now = Date.now();
        installFortis([makeAlert({ timestamp: now })]);
        resetStore([makeAlert({ timestamp: now })]);

        render(<AlertsView />);
        expect(await screen.findByText('Just now')).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(20_000);
        });

        expect(screen.getByText(/\d+s ago/)).toBeInTheDocument();
    });
});

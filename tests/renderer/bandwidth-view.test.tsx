import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BandwidthSnapshot } from '@shared/types/m3';
import { EMPTY_BANDWIDTH_SNAPSHOT } from '@shared/types/m3';

import BandwidthView from '@renderer/components/bandwidth/BandwidthView';
import { useBandwidthStore } from '@renderer/stores/bandwidth-store';

function stubFortis(snapshot: BandwidthSnapshot): void {
    const fortis = {
        getBandwidth: vi.fn(async () => snapshot),
        onBandwidthUpdate: vi.fn(() => () => {}),
    };
    (window as unknown as { fortis: unknown }).fortis = fortis;
}

beforeEach(() => {
    useBandwidthStore.getState().setSnapshot(EMPTY_BANDWIDTH_SNAPSHOT);
    localStorage.clear();
});

const TWO_PROCESSES: BandwidthSnapshot = {
    status: 'ready',
    sampledAt: 1_700_000_000_000,
    processes: [
        { pid: 456, processName: 'Safari', bytesInPerSec: 2048, bytesOutPerSec: 1024 },
        { pid: 78, processName: 'mDNSResponder', bytesInPerSec: 512, bytesOutPerSec: 0 },
    ],
};

describe('BandwidthView', () => {
    it('renders a row per process when bandwidth is available', async () => {
        stubFortis(TWO_PROCESSES);
        render(<BandwidthView />);
        // Orbit nodes expose their label as the button's accessible name.
        await waitFor(() => expect(screen.getByRole('button', { name: 'Safari' })).toBeInTheDocument());

        await userEvent.setup().click(screen.getByRole('button', { name: 'Table' }));

        expect(screen.getByRole('table', { name: 'Per-process bandwidth' })).toBeInTheDocument();
        expect(screen.getByText('mDNSResponder')).toBeInTheDocument();
        expect(screen.getByText('456')).toBeInTheDocument();
        // Safari: 2048 B/s down, 1024 B/s up, 3072 B/s total.
        expect(screen.getByText('2.0 KB/s')).toBeInTheDocument();
        expect(screen.getByText('3.0 KB/s')).toBeInTheDocument();
    });

    it('defaults to the orbit and plots each process', async () => {
        stubFortis(TWO_PROCESSES);
        const { container } = render(<BandwidthView />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Safari' })).toBeInTheDocument());
        expect(container.querySelector('.hub-orbit__svg')).not.toBeNull();
        expect(container.querySelectorAll('.hub-orbit__node').length).toBe(2);
    });

    it('sums the per-process rates into a toolbar total', async () => {
        stubFortis(TWO_PROCESSES);
        render(<BandwidthView />);
        // 2048 + 512 down, 1024 + 0 up.
        await waitFor(() =>
            expect(screen.getByLabelText('Total download 2.5 KB/s')).toBeInTheDocument(),
        );
        expect(screen.getByLabelText('Total upload 1.0 KB/s')).toBeInTheDocument();
    });

    it('shows the unsupported copy only when the platform has no counter', async () => {
        stubFortis({ status: 'unsupported', sampledAt: 0, processes: [] });
        render(<BandwidthView />);
        await waitFor(() =>
            expect(screen.getByText(/unavailable on this system/i)).toBeInTheDocument(),
        );
    });

    it('shows a measuring state — not "unsupported" — while awaiting the second sample', async () => {
        stubFortis({ status: 'sampling', sampledAt: 0, processes: [] });
        render(<BandwidthView />);
        await waitFor(() => expect(screen.getByText(/needs two samples/i)).toBeInTheDocument());
        expect(screen.queryByText(/unavailable on this system/i)).not.toBeInTheDocument();
    });

    it('shows an empty state when ready but no active traffic', async () => {
        stubFortis({ status: 'ready', sampledAt: Date.now(), processes: [] });
        render(<BandwidthView />);
        await waitFor(() =>
            expect(screen.getByText('No active per-process bandwidth')).toBeInTheDocument(),
        );
    });
});

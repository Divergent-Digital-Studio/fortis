import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CommunityState } from '@shared/types/m7';
import { DEFAULT_SETTINGS } from '@shared/types/settings';

import CommunityView from '@renderer/components/community/CommunityView';
import { useCommunityStore } from '@renderer/stores/community-store';
import { useSettingsStore } from '@renderer/stores/settings-store';

function state(over: Partial<CommunityState> = {}): CommunityState {
    return {
        enabled: false,
        configured: false,
        verified: false,
        severityFloor: 'warning',
        submittedCount: 0,
        lastSubmittedAt: null,
        ...over,
    };
}

const setCommunityEnabled = vi.fn(async () => state({ enabled: true }));
const setCommunityConfig = vi.fn(async () => state({ configured: true }));
const testCommunity = vi.fn(async () => true);

function setup(tier: 'free' | 'pro', communityState: CommunityState, endpoint = '') {
    useSettingsStore.setState({
        settings: { ...DEFAULT_SETTINGS, tier, threatIntelEndpoint: endpoint },
        isLoaded: true,
    });
    useCommunityStore.setState({ state: communityState });
    (window as unknown as { fortis: unknown }).fortis = {
        getCommunityState: vi.fn(async () => communityState),
        onCommunityState: vi.fn(() => () => {}),
        setCommunityEnabled,
        setCommunityConfig,
        testCommunity,
        previewCommunityPayload: vi.fn(async () => []),
    };
}

beforeEach(() => {
    setCommunityEnabled.mockClear();
    setCommunityConfig.mockClear();
    testCommunity.mockClear();
    testCommunity.mockResolvedValue(true);
});

function endpointInput(): HTMLInputElement {
    return screen.getByLabelText('Sharing endpoint') as HTMLInputElement;
}

describe('CommunityView', () => {
    it('keeps the locked panel out of the tab order on the free tier', async () => {
        setup('free', state());
        const { container } = render(<CommunityView />);
        await waitFor(() => expect(container.querySelector('.community-view__body')).toBeTruthy());

        const body = container.querySelector('.community-view__body') as HTMLElement;
        expect(body.hasAttribute('inert')).toBe(true);
        expect(container.querySelector('.community-view__lock-overlay')).toBeTruthy();
    });

    it('leaves the panel interactive on a paid tier', async () => {
        setup('pro', state());
        const { container } = render(<CommunityView />);
        await waitFor(() => expect(container.querySelector('.community-view__body')).toBeTruthy());

        const body = container.querySelector('.community-view__body') as HTMLElement;
        expect(body.hasAttribute('inert')).toBe(false);
        expect(container.querySelector('.community-view__lock-overlay')).toBeNull();
    });

    it('hydrates the endpoint field from the persisted setting', async () => {
        setup('pro', state({ configured: true }), 'https://intel.example.com/submit');
        render(<CommunityView />);
        await waitFor(() => expect(endpointInput().value).toBe('https://intel.example.com/submit'));
    });

    it('warns when sharing is enabled but the endpoint is unverified', async () => {
        setup('pro', state({ enabled: true, configured: true, verified: false }));
        render(<CommunityView />);
        await waitFor(() => expect(screen.getByText(/nothing is being sent/i)).toBeInTheDocument());
    });

    it('does not warn once the endpoint is verified', async () => {
        setup('pro', state({ enabled: true, configured: true, verified: true }));
        render(<CommunityView />);
        await waitFor(() => expect(screen.getByText('Verified')).toBeInTheDocument());
        expect(screen.queryByText(/nothing is being sent/i)).toBeNull();
    });

    it('reports the outcome of a connection test', async () => {
        setup('pro', state(), 'https://intel.example.com/submit');
        render(<CommunityView />);
        await waitFor(() => expect(endpointInput().value).not.toBe(''));

        fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
        await waitFor(() => expect(screen.getByText(/Sharing is now active/i)).toBeInTheDocument());
        expect(testCommunity).toHaveBeenCalledWith('https://intel.example.com/submit', '', undefined);
    });

    it('surfaces a failed connection test instead of failing silently', async () => {
        testCommunity.mockResolvedValue(false);
        setup('pro', state(), 'https://intel.example.com/submit');
        render(<CommunityView />);
        await waitFor(() => expect(endpointInput().value).not.toBe(''));

        fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
        await waitFor(() => expect(screen.getByText(/Could not reach the endpoint/i)).toBeInTheDocument());
    });

    it('surfaces an IPC rejection (e.g. RBAC FORBIDDEN) instead of an unhandled rejection', async () => {
        testCommunity.mockRejectedValue(new Error('FORBIDDEN: role viewer lacks scope manage-integrations'));
        setup('pro', state(), 'https://intel.example.com/submit');
        render(<CommunityView />);
        await waitFor(() => expect(endpointInput().value).not.toBe(''));

        fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
        await waitFor(() => expect(screen.getByText(/FORBIDDEN/i)).toBeInTheDocument());
    });

    it('never saves an empty endpoint over a configured one', async () => {
        setup('pro', state({ configured: true }), 'https://intel.example.com/submit');
        render(<CommunityView />);
        await waitFor(() => expect(endpointInput().value).toBe('https://intel.example.com/submit'));

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(setCommunityConfig).toHaveBeenCalled());
        expect(setCommunityConfig.mock.calls[0][0]).toMatchObject({
            endpoint: 'https://intel.example.com/submit',
        });
    });
});

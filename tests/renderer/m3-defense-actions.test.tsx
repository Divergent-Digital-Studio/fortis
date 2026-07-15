import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DefenseAction } from '@shared/types/m3';

vi.mock('@renderer/stores', async () => {
    const actual = await vi.importActual<typeof import('@renderer/stores')>('@renderer/stores');
    return {
        ...actual,
        useSettingsStore: (selector: (s: { settings: { tier: string } }) => unknown) =>
            selector({ settings: { tier: 'pro' } }),
        selectTier: (s: { settings: { tier: string } }) => s.settings.tier,
    };
});

import DefenseView from '@renderer/components/defense/DefenseView';

function killAction(over: Partial<DefenseAction> = {}): DefenseAction {
    return {
        id: 'a1',
        createdAt: 0,
        kind: 'kill',
        status: 'pending',
        target: '1234',
        processName: 'suspicious',
        reason: 'High data exfiltration detected',
        ruleId: null,
        executedAt: null,
        error: null,
        ...over,
    };
}

const confirmKill = vi.fn(async () => []);

beforeEach(() => {
    confirmKill.mockClear();
    const fortis = {
        getDefenseActions: vi.fn(async () => [killAction()]),
        getBlockedIps: vi.fn(async () => []),
        getRules: vi.fn(async () => []),
        getCerts: vi.fn(async () => []),
        onDefenseActionsUpdate: vi.fn(() => () => {}),
        onCertsUpdate: vi.fn(() => () => {}),
        saveRule: vi.fn(async () => []),
        deleteRule: vi.fn(async () => []),
        confirmKill,
        confirmBlock: vi.fn(async () => []),
        cancelDefenseAction: vi.fn(async () => []),
        unblockIp: vi.fn(async () => []),
        updateSettings: vi.fn(async () => {}),
    };
    (window as unknown as { fortis: unknown }).fortis = fortis;
});

describe('DefenseView Actions tab', () => {
    it('confirms a pending kill through the ConfirmDialog', async () => {
        render(<DefenseView />);

        fireEvent.click(screen.getByText('Actions'));

        await waitFor(() => {
            expect(screen.getByText('High data exfiltration detected')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Confirm'));

        await waitFor(() => {
            expect(screen.getByText('Kill process 1234?')).toBeInTheDocument();
        });

        const dialogConfirm = screen
            .getAllByRole('button')
            .find((b) => b.textContent === 'Confirm' && b.closest('.confirm-dialog__card'));
        expect(dialogConfirm).toBeDefined();
        fireEvent.click(dialogConfirm as HTMLElement);

        await waitFor(() => {
            expect(confirmKill).toHaveBeenCalledWith('a1');
        });
    });
});

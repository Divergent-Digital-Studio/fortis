import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CustomRule, TlsCertInfo } from '@shared/types/m3';

import DefenseView from '@renderer/components/defense/DefenseView';
import { useDefenseStore } from '@renderer/stores/defense-store';

function rule(over: Partial<CustomRule> = {}): CustomRule {
    return {
        id: 'r1',
        name: 'Block known bad port',
        enabled: true,
        conditions: [{ field: 'remotePort', operator: 'equals', value: '6667' }],
        action: 'alert',
        threatLevel: 'warning',
        createdAt: 0,
        ...over,
    };
}

function cert(over: Partial<TlsCertInfo> = {}): TlsCertInfo {
    return {
        hostPort: 'example.com:443',
        host: 'example.com',
        port: 443,
        issuer: 'Lets Encrypt',
        subject: 'example.com',
        validFrom: 1_690_000_000_000,
        validTo: 1_710_000_000_000,
        daysUntilExpiry: 60,
        selfSigned: false,
        status: 'valid',
        lastChecked: 1_700_000_000_000,
        ...over,
    };
}

const saveRule = vi.fn(async () => [rule()]);
let certs: TlsCertInfo[] = [];

beforeEach(() => {
    saveRule.mockReset();
    saveRule.mockResolvedValue([rule()]);
    certs = [];
    useDefenseStore.setState({ actions: [], blockedIps: [], rules: [], certs: [], error: null });
    const fortis = {
        getDefenseActions: vi.fn(async () => []),
        getBlockedIps: vi.fn(async () => []),
        getRules: vi.fn(async () => [rule()]),
        getCerts: vi.fn(async () => certs),
        onDefenseActionsUpdate: vi.fn(() => () => {}),
        onCertsUpdate: vi.fn(() => () => {}),
        saveRule,
        deleteRule: vi.fn(async () => []),
        confirmKill: vi.fn(async () => []),
        confirmBlock: vi.fn(async () => []),
        cancelDefenseAction: vi.fn(async () => []),
        unblockIp: vi.fn(async () => []),
    };
    (window as unknown as { fortis: unknown }).fortis = fortis;
});

async function openRulesTab(): Promise<void> {
    render(<DefenseView />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(screen.getByText('Rules'));
    await waitFor(() => expect(screen.getByText('Block known bad port')).toBeInTheDocument());
}

describe('DefenseView', () => {
    it('opens on the Actions tab so pending confirmations are seen first', async () => {
        render(<DefenseView />);
        await waitFor(() => expect(screen.getByText('No pending actions')).toBeInTheDocument());
    });

    it('renders the rule name on the Rules tab', async () => {
        await openRulesTab();
    });

    it('adds a condition row when "Add condition" is clicked', async () => {
        await openRulesTab();
        expect(screen.queryByLabelText('Condition value')).toBeNull();
        fireEvent.click(screen.getByText('Add condition'));
        expect(screen.getByLabelText('Condition value')).toBeInTheDocument();
    });

    it('refuses to save a rule with a name but no conditions', async () => {
        await openRulesTab();
        fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'My rule' } });
        fireEvent.click(screen.getByText('Save rule'));
        expect(saveRule).not.toHaveBeenCalled();
    });

    it('saves a trimmed rule once it has a name and a filled condition', async () => {
        await openRulesTab();
        fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: '  My rule  ' } });
        fireEvent.click(screen.getByText('Add condition'));
        fireEvent.change(screen.getByLabelText('Condition value'), { target: { value: ' 6667 ' } });
        fireEvent.click(screen.getByText('Save rule'));
        await waitFor(() => expect(saveRule).toHaveBeenCalled());
        const arg = saveRule.mock.calls[0]?.[0] as CustomRule;
        expect(arg.name).toBe('My rule');
        expect(arg.enabled).toBe(true);
        expect(arg.conditions).toEqual([{ field: 'process', operator: 'equals', value: '6667' }]);
    });

    it('surfaces a backend rejection instead of failing silently', async () => {
        saveRule.mockRejectedValueOnce(new Error('Invalid rule: needs a name'));
        await openRulesTab();
        fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'My rule' } });
        fireEvent.click(screen.getByText('Add condition'));
        fireEvent.change(screen.getByLabelText('Condition value'), { target: { value: 'x' } });
        fireEvent.click(screen.getByText('Save rule'));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Invalid rule: needs a name');
        });
    });

    it('renders a cert row with its status badge on the Certificates tab', async () => {
        certs = [cert({ status: 'expiring', daysUntilExpiry: 7 })];
        render(<DefenseView />);
        await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
        fireEvent.click(screen.getByText('Certificates'));
        await waitFor(() => {
            expect(screen.getByText('example.com:443')).toBeInTheDocument();
        });
        expect(screen.getByText('expiring')).toBeInTheDocument();
        expect(screen.getByText('7 days to expiry')).toBeInTheDocument();
    });
});

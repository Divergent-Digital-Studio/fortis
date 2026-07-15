import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DefenseSection from '@renderer/components/settings/DefenseSection';

const testWebhook = vi.fn(async () => true);

beforeEach(() => {
    testWebhook.mockClear();
    testWebhook.mockResolvedValue(true);
    (window as unknown as { fortis: unknown }).fortis = { testWebhook };
});

function renderSection(over: Partial<React.ComponentProps<typeof DefenseSection>> = {}) {
    const props = {
        defenseEnabled: false,
        webhookUrl: '',
        webhookEnabled: false,
        onDefenseEnabledChange: vi.fn(),
        onWebhookUrlChange: vi.fn(),
        onWebhookEnabledChange: vi.fn(),
        ...over,
    };
    render(<DefenseSection {...props} />);
    return props;
}

describe('DefenseSection', () => {
    it('disables the webhook alerts toggle when the url is empty', () => {
        renderSection({ webhookUrl: '' });
        const toggle = screen.getByLabelText('Enable webhook alerts') as HTMLInputElement;
        expect(toggle).toBeDisabled();
    });

    it('enables the webhook alerts toggle when a url is present', () => {
        renderSection({ webhookUrl: 'https://example.com/hook' });
        const toggle = screen.getByLabelText('Enable webhook alerts') as HTMLInputElement;
        expect(toggle).not.toBeDisabled();
    });

    it('calls testWebhook with the current url when Send test is clicked', async () => {
        renderSection({ webhookUrl: 'https://example.com/hook' });
        fireEvent.click(screen.getByRole('button', { name: /send test/i }));
        await Promise.resolve();
        expect(testWebhook).toHaveBeenCalledWith('https://example.com/hook');
    });

    it('calls onDefenseEnabledChange when the defense toggle changes', () => {
        const props = renderSection();
        fireEvent.click(screen.getByLabelText('Enable active defense'));
        expect(props.onDefenseEnabledChange).toHaveBeenCalledWith(true);
    });
});

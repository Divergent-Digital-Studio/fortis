import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nProvider, useI18n } from '../../src/renderer/i18n';

function Probe() {
    const { t, locale, dir, setLocale } = useI18n();
    return (
        <div>
            <span data-testid="text">{t('nav.overview')}</span>
            <span data-testid="locale">{locale}</span>
            <span data-testid="dir">{dir}</span>
            <button onClick={() => setLocale('fa')}>fa</button>
        </div>
    );
}

describe('I18nProvider', () => {
    beforeEach(() => {
        (window as unknown as { fortis: unknown }).fortis = { updateSettings: vi.fn().mockResolvedValue(undefined) };
    });

    it('renders translated text and flips dir on an RTL locale', () => {
        render(
            <I18nProvider initialLocale="en">
                <Probe />
            </I18nProvider>,
        );
        expect(screen.getByTestId('text').textContent).toBe('Overview');
        expect(screen.getByTestId('dir').textContent).toBe('ltr');
        act(() => {
            screen.getByText('fa').click();
        });
        expect(screen.getByTestId('locale').textContent).toBe('fa');
        expect(screen.getByTestId('dir').textContent).toBe('rtl');
        expect(screen.getByTestId('text').textContent).toBe('نمای کلی');
        expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    });
});

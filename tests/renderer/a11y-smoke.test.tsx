import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import Sidebar from '../../src/renderer/components/layout/Sidebar';
import LanguageSection from '../../src/renderer/components/settings/LanguageSection';
import { I18nProvider } from '../../src/renderer/i18n';

interface ControlName {
    tag: string;
    name: string;
}

function accessibleNames(container: HTMLElement): ControlName[] {
    const controls = container.querySelectorAll('button, a[href], [role="button"], input, select');
    return Array.from(controls).map((el) => {
        const aria = el.getAttribute('aria-label');
        const labelledBy = el.getAttribute('aria-labelledby');
        let labelledByText = '';
        if (labelledBy) {
            labelledByText = labelledBy
                .split(/\s+/)
                .map((id) => container.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '')
                .join(' ')
                .trim();
        }
        const text = (el.textContent ?? '').trim();
        const title = el.getAttribute('title') ?? '';
        return { tag: el.tagName, name: aria ?? (text || labelledByText || title) };
    });
}

describe('a11y: every interactive control has an accessible name', () => {
    beforeEach(() => {
        (window as unknown as { fortis: unknown }).fortis = { updateSettings: vi.fn().mockResolvedValue(undefined) };
    });

    it('Sidebar nav controls all expose an accessible name', () => {
        const { container } = render(<Sidebar />);
        const named = accessibleNames(container);
        expect(named.length).toBeGreaterThan(0);
        for (const c of named) {
            expect(c.name, `${c.tag} missing accessible name`).not.toBe('');
        }
    });

    it('LanguageSection control exposes an accessible name', () => {
        const { container } = render(
            <I18nProvider initialLocale="en">
                <LanguageSection />
            </I18nProvider>,
        );
        for (const c of accessibleNames(container)) {
            expect(c.name, `${c.tag} missing accessible name`).not.toBe('');
        }
    });
});

import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { resolveTheme, applyTheme } from '../styles/theme';

function prefersLight(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-color-scheme: light)').matches;
}

function useTheme(): void {
    const theme = useSettingsStore((s) => s.settings.theme);

    useEffect(() => {
        applyTheme(resolveTheme(theme, prefersLight()));

        if (theme !== 'system') return;
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

        const media = window.matchMedia('(prefers-color-scheme: light)');
        const handler = (): void => {
            applyTheme(resolveTheme('system', media.matches));
        };
        media.addEventListener('change', handler);
        return () => media.removeEventListener('change', handler);
    }, [theme]);
}

export default useTheme;

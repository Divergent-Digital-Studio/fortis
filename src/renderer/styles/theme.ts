import type { Theme } from '@shared/types/settings';
import type { TextDirection } from '@shared/types/m7';

export type EffectiveTheme = 'dark' | 'light';

export function resolveTheme(theme: Theme, prefersLight: boolean): EffectiveTheme {
    if (theme === 'light') return 'light';
    if (theme === 'dark') return 'dark';
    if (theme === 'system') return prefersLight ? 'light' : 'dark';
    return 'dark';
}

export function applyTheme(effective: EffectiveTheme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', effective);
}

export function applyDirection(dir: TextDirection): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('dir', dir);
}

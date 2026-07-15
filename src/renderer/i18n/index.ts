import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import type { SupportedLocale, TextDirection } from '../../shared/types/m7';
import { lookup, pluralize, localeDir, type Catalog } from './catalog';
import { applyDirection } from '../styles/theme';
import { useSettingsStore } from '../stores/settings-store';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import fa from './locales/fa.json';
import ar from './locales/ar.json';

const CATALOGS: Record<SupportedLocale, Catalog> = { en, es, fr, de, fa, ar };
const FALLBACK: Catalog = en;

export const ENABLED_LOCALES: readonly SupportedLocale[] = ['en', 'es', 'fr', 'de', 'fa', 'ar'];

interface I18nContextValue {
    locale: SupportedLocale;
    dir: TextDirection;
    t: (key: string, vars?: Record<string, string | number>) => string;
    tn: (key: string, count: number, vars?: Record<string, string | number>) => string;
    setLocale: (locale: SupportedLocale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
    initialLocale: SupportedLocale;
    children: ReactNode;
}

export function I18nProvider({ initialLocale, children }: I18nProviderProps) {
    const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);
    const catalog = CATALOGS[locale] ?? FALLBACK;
    const dir = localeDir(locale);

    useEffect(() => {
        applyDirection(dir);
        if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', locale);
    }, [dir, locale]);

    useEffect(
        () =>
            useSettingsStore.subscribe(
                (state) => state.settings.language,
                (language) => {
                    if (ENABLED_LOCALES.includes(language)) setLocaleState(language);
                },
            ),
        [],
    );

    const setLocale = useCallback((next: SupportedLocale) => {
        setLocaleState(next);
        void window.fortis.updateSettings({ language: next });
    }, []);

    const value = useMemo<I18nContextValue>(
        () => ({
            locale,
            dir,
            t: (key, vars) => lookup(catalog, FALLBACK, key, vars),
            tn: (key, count, vars) => pluralize(catalog, FALLBACK, key, count, vars),
            setLocale,
        }),
        [catalog, dir, locale, setLocale],
    );

    return createElement(I18nContext.Provider, { value }, children);
}

const STANDALONE_FALLBACK: I18nContextValue = {
    locale: 'en',
    dir: 'ltr',
    t: (key, vars) => lookup(FALLBACK, FALLBACK, key, vars),
    tn: (key, count, vars) => pluralize(FALLBACK, FALLBACK, key, count, vars),
    setLocale: () => undefined,
};

export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext);
    return ctx ?? STANDALONE_FALLBACK;
}

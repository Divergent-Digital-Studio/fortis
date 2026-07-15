import type { SupportedLocale, TextDirection } from '../../shared/types/m7';

export type Catalog = Record<string, string>;

const RTL_LOCALES = new Set<SupportedLocale>(['fa', 'ar']);

export function localeDir(locale: SupportedLocale): TextDirection {
    return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = vars[name];
        return value === undefined ? match : String(value);
    });
}

export function lookup(
    catalog: Catalog,
    fallback: Catalog,
    key: string,
    vars?: Record<string, string | number>,
): string {
    const template = catalog[key] ?? fallback[key] ?? key;
    return interpolate(template, vars);
}

export function pluralize(
    catalog: Catalog,
    fallback: Catalog,
    key: string,
    count: number,
    vars?: Record<string, string | number>,
): string {
    const form = count === 1 ? 'one' : 'other';
    const merged = { ...(vars ?? {}), count };
    return lookup(catalog, fallback, `${key}.${form}`, merged);
}

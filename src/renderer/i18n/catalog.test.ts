import { describe, it, expect } from 'vitest';
import { lookup, pluralize, localeDir } from './catalog';

const en = { 'nav.overview': 'Overview', hi: 'Hello {name}', 'items.one': '{count} item', 'items.other': '{count} items' };
const fa = { 'nav.overview': 'نمای کلی' };

describe('catalog', () => {
    it('looks up a key in the active catalog', () => {
        expect(lookup(fa, en, 'nav.overview')).toBe('نمای کلی');
    });
    it('falls back to the reference catalog, then the key', () => {
        expect(lookup(fa, en, 'hi', { name: 'Sam' })).toBe('Hello Sam');
        expect(lookup(fa, en, 'missing.key')).toBe('missing.key');
    });
    it('interpolates vars', () => {
        expect(lookup(en, en, 'hi', { name: 'Ann' })).toBe('Hello Ann');
    });
    it('pluralizes one vs other', () => {
        expect(pluralize(en, en, 'items', 1)).toBe('1 item');
        expect(pluralize(en, en, 'items', 5)).toBe('5 items');
    });
    it('maps rtl locales', () => {
        expect(localeDir('fa')).toBe('rtl');
        expect(localeDir('ar')).toBe('rtl');
        expect(localeDir('en')).toBe('ltr');
        expect(localeDir('es')).toBe('ltr');
    });
});

import { describe, it, expect } from 'vitest';
import { buildReleaseNotes } from './release-notes';

describe('buildReleaseNotes', () => {
    it('renders a markdown heading with the version', () => {
        const { markdown } = buildReleaseNotes('1.0.0', ['Alpha', 'Beta']);
        expect(markdown).toContain('# Fortis 1.0.0');
        expect(markdown).toContain('- Alpha');
        expect(markdown).toContain('- Beta');
    });
    it('renders html with escaped entities', () => {
        const { html } = buildReleaseNotes('1.0.0', ['A & B < C']);
        expect(html).toContain('<h2>Fortis 1.0.0</h2>');
        expect(html).toContain('A &amp; B &lt; C');
    });
    it('handles an empty highlight list', () => {
        const { markdown, html } = buildReleaseNotes('1.0.0', []);
        expect(markdown).toContain('# Fortis 1.0.0');
        expect(html).toContain('<ul></ul>');
    });
});

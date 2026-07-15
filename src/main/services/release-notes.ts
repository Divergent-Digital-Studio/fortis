export interface ReleaseNotes {
    markdown: string;
    html: string;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function buildReleaseNotes(version: string, highlights: string[]): ReleaseNotes {
    const markdown = [`# Fortis ${version}`, '', ...highlights.map((h) => `- ${h}`)].join('\n');
    const items = highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('');
    const html = `<h2>Fortis ${escapeHtml(version)}</h2><ul>${items}</ul>`;
    return { markdown, html };
}

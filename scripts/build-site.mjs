import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIERS, FEATURE_MATRIX, FAQ } from '../website/site-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const websiteDir = join(root, 'website');
const outDir = join(root, 'dist-site');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const repo = process.env.FORTIS_REPO || 'fortis/fortis';

const highlights = extractHighlights(version);

function escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function renderPricing() {
    return TIERS.map((tier) => {
        const items = tier.features.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
        return `<article class="pricing__card"><h3 class="pricing__name">${escapeHtml(tier.name)}</h3><p class="pricing__price">${escapeHtml(tier.price)}</p><p class="pricing__blurb">${escapeHtml(tier.blurb)}</p><ul class="pricing__features">${items}</ul></article>`;
    }).join('');
}

function cell(value) {
    return value ? '<td class="matrix__yes" aria-label="Included">&#10003;</td>' : '<td class="matrix__no" aria-label="Not included">&#8212;</td>';
}

function renderFeatureMatrix() {
    const rows = FEATURE_MATRIX.map(
        (row) => `<tr><th scope="row">${escapeHtml(row.feature)}</th>${cell(row.free)}${cell(row.fortress)}${cell(row.enterprise)}</tr>`,
    ).join('');
    return `<table class="matrix__table"><thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Fortress</th><th scope="col">Enterprise</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderFaq() {
    return FAQ.map(
        (item) => `<details class="faq__item"><summary class="faq__q">${escapeHtml(item.q)}</summary><p class="faq__a">${escapeHtml(item.a)}</p></details>`,
    ).join('');
}

function extractHighlights(forVersion) {
    const source = readFileSync(join(root, 'src/shared/types/m4.ts'), 'utf8');
    const blockMatch = source.match(/RELEASE_HIGHLIGHTS[^=]*=\s*\{([\s\S]*?)\n\};/);
    if (!blockMatch) return [];
    const block = blockMatch[1];
    const versionMatch = block.match(
        new RegExp(`'${forVersion.replace(/\./g, '\\.')}'\\s*:\\s*\\[([\\s\\S]*?)\\]`),
    );
    if (!versionMatch) return [];
    const items = [...versionMatch[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    return items;
}

function replacePlaceholders(content) {
    return content
        .replaceAll('__VERSION__', version)
        .replaceAll('__REPO__', repo)
        .replaceAll('__HIGHLIGHTS__', JSON.stringify(highlights))
        .replaceAll('__PRICING__', renderPricing())
        .replaceAll('__FEATURE_MATRIX__', renderFeatureMatrix())
        .replaceAll('__FAQ__', renderFaq());
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const textFiles = ['index.html', 'styles.css', 'detect.js', 'site.js'];
for (const file of textFiles) {
    const src = join(websiteDir, file);
    if (!existsSync(src)) {
        throw new Error(`[build-site] missing source file: ${file}`);
    }
    const content = replacePlaceholders(readFileSync(src, 'utf8'));
    writeFileSync(join(outDir, file), content, 'utf8');
}

const noJekyll = join(outDir, '.nojekyll');
writeFileSync(noJekyll, '', 'utf8');

console.log(`[build-site] built dist-site for version ${version} (repo ${repo}, ${highlights.length} highlights)`);

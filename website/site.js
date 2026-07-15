import { downloadAssetName, downloadUrl } from './detect.js';

const VERSION = '__VERSION__';
const HIGHLIGHTS = __HIGHLIGHTS__;

const ALL_PLATFORMS = [
    { os: 'mac', arch: 'arm64', label: 'macOS (Apple Silicon)' },
    { os: 'mac', arch: 'x64', label: 'macOS (Intel)' },
    { os: 'win', arch: 'x64', label: 'Windows' },
    { os: 'linux', arch: 'x64', label: 'Linux (AppImage)' },
];

const LINUX_DEB = { label: 'Linux (Debian/Ubuntu .deb)', asset: `Fortis-${VERSION}.deb` };

function renderDownloads() {
    const list = document.getElementById('downloads-list');
    if (!list) return;
    for (const entry of ALL_PLATFORMS) {
        const asset = downloadAssetName({ os: entry.os, arch: entry.arch }, VERSION);
        list.appendChild(makeItem(entry.label, asset));
    }
    list.appendChild(makeItem(LINUX_DEB.label, LINUX_DEB.asset));
}

function makeItem(label, asset) {
    const li = document.createElement('li');
    li.className = 'downloads__item';
    const a = document.createElement('a');
    a.href = downloadUrl(asset);
    a.textContent = label;
    a.className = 'downloads__link';
    const span = document.createElement('span');
    span.className = 'downloads__asset';
    span.textContent = asset;
    li.appendChild(a);
    li.appendChild(span);
    return li;
}

function renderNotes() {
    const container = document.getElementById('release-notes');
    if (!container) return;
    const heading = document.createElement('h3');
    heading.textContent = `Fortis ${VERSION}`;
    const ul = document.createElement('ul');
    for (const item of HIGHLIGHTS) {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
    }
    container.appendChild(heading);
    container.appendChild(ul);
}

renderDownloads();
renderNotes();

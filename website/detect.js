export function detectPlatform(userAgent, platformHint) {
    const ua = userAgent.toLowerCase();
    const hint = platformHint.toLowerCase();
    if (ua.includes('windows') || hint.startsWith('win')) {
        return { os: 'win', arch: 'x64' };
    }
    if (ua.includes('linux') && !ua.includes('android')) {
        return { os: 'linux', arch: 'x64' };
    }
    if (ua.includes('mac') || hint.includes('mac')) {
        const arm = ua.includes('arm64') || ua.includes('aarch64');
        return { os: 'mac', arch: arm ? 'arm64' : 'x64' };
    }
    return { os: 'mac', arch: 'x64' };
}

export function downloadAssetName(platform, version) {
    switch (platform.os) {
        case 'mac':
            return platform.arch === 'arm64'
                ? `Fortis-${version}-arm64.dmg`
                : `Fortis-${version}.dmg`;
        case 'win':
            return `Fortis-${version}-setup.exe`;
        case 'linux':
            return `Fortis-${version}.AppImage`;
        default:
            return `Fortis-${version}.dmg`;
    }
}

const VERSION = '__VERSION__';
const REPO = '__REPO__';

const OS_LABELS = {
    mac: 'macOS',
    win: 'Windows',
    linux: 'Linux',
};

export function downloadUrl(assetName) {
    return `https://github.com/${REPO}/releases/latest/download/${assetName}`;
}

export function initDownloadButton() {
    const primary = document.getElementById('primary-download');
    if (!primary) return;
    const platform = detectPlatform(navigator.userAgent, navigator.platform || '');
    const asset = downloadAssetName(platform, VERSION);
    primary.href = downloadUrl(asset);
    primary.textContent = `Download for ${OS_LABELS[platform.os]}`;
    const note = document.getElementById('primary-download-note');
    if (note) note.textContent = `Version ${VERSION} — ${asset}`;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDownloadButton);
    } else {
        initDownloadButton();
    }
}

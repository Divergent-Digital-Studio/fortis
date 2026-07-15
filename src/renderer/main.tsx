import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './components/common/ErrorBoundary';
import App from './App';
import { I18nProvider, ENABLED_LOCALES } from './i18n';
import type { SupportedLocale } from '@shared/types/m7';
import './styles/global.css';
import './styles/components/page-shell.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Root element #root not found in document');
}

async function resolveInitialLocale(): Promise<SupportedLocale> {
    try {
        const settings = await window.fortis.getSettings();
        return ENABLED_LOCALES.includes(settings.language) ? settings.language : 'en';
    } catch {
        return 'en';
    }
}

async function bootstrap(): Promise<void> {
    const initialLocale = await resolveInitialLocale();
    createRoot(rootElement as HTMLElement).render(
        createElement(
            StrictMode,
            null,
            createElement(
                ErrorBoundary,
                null,
                createElement(I18nProvider, { initialLocale, children: createElement(App) }),
            ),
        ),
    );
}

void bootstrap().catch((err) => {
    console.error('[bootstrap] render failed:', err);
});

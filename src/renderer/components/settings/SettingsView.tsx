import { useCallback } from 'react';
import useSettings from '../../hooks/useSettings';
import type { AIProvider, SensitivityLevel, Theme } from '../../types';
import AIConfigSection from './AIConfigSection';
import ScanningSection from './ScanningSection';
import NotificationSection from './NotificationSection';
import AppearanceSection from './AppearanceSection';
import LanguageSection from './LanguageSection';
import DefenseSection from './DefenseSection';
import RemoteSection from './RemoteSection';
import PagerDutySection from './PagerDutySection';
import AccessControlSection from './AccessControlSection';
import RestApiSection from './RestApiSection';
import SiemSection from './SiemSection';
import ComplianceSection from './ComplianceSection';
import InsiderThreatSection from './InsiderThreatSection';
import UpdatesSection from './UpdatesSection';
import AboutSection from './AboutSection';
import '../../styles/components/settings.css';

function SettingsView() {
    const { settings, updateSettings } = useSettings();

    const handleAIProviderChange = useCallback((provider: AIProvider) => {
        updateSettings({ aiProvider: provider });
    }, [updateSettings]);

    const handleOllamaConfigChange = useCallback((config: { endpoint?: string; model?: string }) => {
        if (config.endpoint !== undefined) updateSettings({ ollamaEndpoint: config.endpoint });
        if (config.model !== undefined) updateSettings({ ollamaModel: config.model });
    }, [updateSettings]);

    const handleOpenaiCompatibleEndpointChange = useCallback((endpoint: string) => {
        updateSettings({ openaiCompatibleEndpoint: endpoint });
    }, [updateSettings]);

    const handleScanIntervalChange = useCallback((interval: number) => {
        updateSettings({ scanInterval: interval });
    }, [updateSettings]);

    const handleAdaptiveIntervalChange = useCallback((enabled: boolean) => {
        updateSettings({ adaptiveInterval: enabled });
    }, [updateSettings]);

    const handleSensitivityChange = useCallback((level: SensitivityLevel) => {
        updateSettings({ sensitivityLevel: level });
    }, [updateSettings]);

    const handleNotificationsChange = useCallback((enabled: boolean) => {
        updateSettings({ notificationsEnabled: enabled });
    }, [updateSettings]);

    const handleSoundChange = useCallback((enabled: boolean) => {
        updateSettings({ soundEnabled: enabled });
    }, [updateSettings]);

    const handleThemeChange = useCallback((theme: Theme) => {
        updateSettings({ theme });
    }, [updateSettings]);

    const handleDefenseEnabledChange = useCallback((enabled: boolean) => {
        updateSettings({ defenseEnabled: enabled });
    }, [updateSettings]);

    const handleWebhookUrlChange = useCallback((url: string) => {
        updateSettings({ webhookUrl: url });
    }, [updateSettings]);

    const handleWebhookEnabledChange = useCallback((enabled: boolean) => {
        updateSettings({ webhookEnabled: enabled });
    }, [updateSettings]);

    return (
        <div className="settings">
            <AIConfigSection
                aiProvider={settings.aiProvider}
                onAIProviderChange={handleAIProviderChange}
                ollamaEndpoint={settings.ollamaEndpoint}
                ollamaModel={settings.ollamaModel}
                onOllamaConfigChange={handleOllamaConfigChange}
                openaiCompatibleEndpoint={settings.openaiCompatibleEndpoint}
                onOpenaiCompatibleEndpointChange={handleOpenaiCompatibleEndpointChange}
            />

            <ScanningSection
                scanInterval={settings.scanInterval}
                adaptiveInterval={settings.adaptiveInterval}
                sensitivityLevel={settings.sensitivityLevel}
                onScanIntervalChange={handleScanIntervalChange}
                onAdaptiveIntervalChange={handleAdaptiveIntervalChange}
                onSensitivityChange={handleSensitivityChange}
            />

            <NotificationSection
                notificationsEnabled={settings.notificationsEnabled}
                soundEnabled={settings.soundEnabled}
                onNotificationsChange={handleNotificationsChange}
                onSoundChange={handleSoundChange}
            />

            <AppearanceSection
                theme={settings.theme}
                onThemeChange={handleThemeChange}
            />

            <LanguageSection />

            <DefenseSection
                defenseEnabled={settings.defenseEnabled}
                webhookUrl={settings.webhookUrl}
                webhookEnabled={settings.webhookEnabled}
                onDefenseEnabledChange={handleDefenseEnabledChange}
                onWebhookUrlChange={handleWebhookUrlChange}
                onWebhookEnabledChange={handleWebhookEnabledChange}
            />

            <RemoteSection />

            <PagerDutySection />

            <AccessControlSection />

            <RestApiSection />

            <SiemSection />

            <ComplianceSection />

            <InsiderThreatSection />

            <UpdatesSection />

            <AboutSection />
        </div>
    );
}

export default SettingsView;


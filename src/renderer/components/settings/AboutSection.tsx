import { useState, useEffect } from 'react';
import { Info, KeyRound } from 'lucide-react';
import Card from '../common/Card';
import { Button } from '../common';
import { useSettingsStore, selectTier } from '../../stores';
import { TIER_LABELS } from '@shared/types/ipc';
import useLicense from '../../hooks/useLicense';
import { useUIStore } from '../../stores/ui-store';
import { useI18n } from '../../i18n';

function AboutSection() {
    const { t } = useI18n();
    const [appVersion, setAppVersion] = useState('...');
    const [platform, setPlatform] = useState('...');
    const tier = useSettingsStore(selectTier);
    const { status } = useLicense();
    const setLicenseDialogOpen = useUIStore((s) => s.setLicenseDialogOpen);

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const [version, plat] = await Promise.all([
                    window.fortis.getAppVersion(),
                    window.fortis.getPlatform(),
                ]);
                setAppVersion(version);
                setPlatform(formatPlatform(plat));
            } catch {
                setAppVersion('');
                setPlatform('');
            }
        };

        fetchInfo();
    }, []);

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <Info size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.about.title')}</span>
                </div>
            }
        >
            <div className="settings-about-grid">
                <span className="settings-about-grid__label">{t('settings.about.version')}</span>
                <span className="settings-about-grid__value">{appVersion || t('settings.about.unknown')}</span>

                <span className="settings-about-grid__label">{t('settings.about.platform')}</span>
                <span className="settings-about-grid__value">{platform || t('settings.about.unknown')}</span>

                <span className="settings-about-grid__label">{t('settings.about.plan')}</span>
                <span className="settings-about-grid__value">
                    {TIER_LABELS[tier]}
                    {status.valid && status.expiresAt && (
                        <span className="settings-about-grid__hint">
                            {' '}{t('settings.about.until', { date: new Date(status.expiresAt).toLocaleDateString() })}
                        </span>
                    )}
                    {status.valid && !status.expiresAt && (
                        <span className="settings-about-grid__hint"> {t('settings.about.noExpiry')}</span>
                    )}
                </span>
            </div>

            <div className="settings-about-license">
                <Button
                    variant="secondary"
                    size="md"
                    icon={KeyRound}
                    onClick={() => setLicenseDialogOpen(true)}
                >
                    {status.valid ? t('settings.about.manageLicense') : t('settings.about.activateLicense')}
                </Button>
            </div>

            <div className="settings-about-attribution">
                <span className="settings-about-attribution__title">{t('settings.about.bundledData')}</span>
                <span className="settings-about-attribution__item">
                    {t('settings.about.attributionGeo')}
                </span>
                <span className="settings-about-attribution__item">
                    {t('settings.about.attributionMac')}
                </span>
            </div>
        </Card>
    );
}

function formatPlatform(platform: string): string {
    const platformNames: Record<string, string> = {
        darwin: 'macOS',
        win32: 'Windows',
        linux: 'Linux',
    };
    return platformNames[platform] ?? platform;
}

export default AboutSection;

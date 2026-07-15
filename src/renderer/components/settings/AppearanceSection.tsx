import { useId } from 'react';
import { Palette } from 'lucide-react';
import Card from '../common/Card';
import Select from '../common/Select';
import type { SelectOption } from '../common/Select';
import type { Theme } from '@shared/types/settings';
import { useI18n } from '../../i18n';

interface AppearanceSectionProps {
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
}

function AppearanceSection({ theme, onThemeChange }: AppearanceSectionProps) {
    const { t } = useI18n();
    const themeId = useId();

    const themeOptions: ReadonlyArray<SelectOption<Theme>> = [
        { value: 'dark', label: t('settings.appearance.themeDark') },
        { value: 'light', label: t('settings.appearance.themeLight') },
        { value: 'system', label: t('settings.appearance.themeSystem') },
    ];

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <Palette size={18} strokeWidth={1.5} className="settings-section__icon" />
                    <span className="settings-section__title">{t('settings.appearance.title')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={themeId} className="settings-field__label">{t('settings.appearance.theme')}</label>
                    <span className="settings-field__hint">{t('settings.appearance.themeHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Select
                        id={themeId}
                        className="settings-select"
                        value={theme}
                        options={themeOptions}
                        onChange={onThemeChange}
                    />
                </div>
            </div>
        </Card>
    );
}

export default AppearanceSection;

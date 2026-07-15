import { useId } from 'react';
import { Languages } from 'lucide-react';
import Card from '../common/Card';
import Select from '../common/Select';
import type { SelectOption } from '../common/Select';
import { useI18n } from '../../i18n';
import type { SupportedLocale } from '@shared/types/m7';

function LanguageSection() {
    const { t, locale, setLocale } = useI18n();
    const languageId = useId();

    const localeOptions: ReadonlyArray<SelectOption<SupportedLocale>> = [
        { value: 'en', label: 'English' },
        { value: 'es', label: 'Español' },
        { value: 'fr', label: 'Français' },
        { value: 'de', label: 'Deutsch' },
        { value: 'fa', label: 'فارسی' },
        { value: 'ar', label: 'العربية' },
    ];

    return (
        <Card
            header={
                <div className="settings-section__header">
                    <Languages size={18} strokeWidth={1.5} className="settings-section__icon" aria-hidden="true" />
                    <span className="settings-section__title">{t('settings.language')}</span>
                </div>
            }
        >
            <div className="settings-field">
                <div className="settings-field__label-group">
                    <label htmlFor={languageId} className="settings-field__label">{t('settings.language')}</label>
                    <span className="settings-field__hint">{t('settings.languageHint')}</span>
                </div>
                <div className="settings-field__control">
                    <Select
                        id={languageId}
                        className="settings-select"
                        value={locale}
                        options={localeOptions}
                        onChange={setLocale}
                    />
                </div>
            </div>
        </Card>
    );
}

export default LanguageSection;

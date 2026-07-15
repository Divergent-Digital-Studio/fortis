import { Orbit, Table2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ViewMode } from '../../hooks/useViewMode';
import { useI18n } from '../../i18n';
import '../../styles/components/view-toggle.css';

interface ViewToggleOption<T extends string> {
    mode: T;
    label: string;
    icon: LucideIcon;
}

interface ViewToggleProps<T extends string = ViewMode> {
    mode: T;
    onChange: (mode: T) => void;
    options?: ReadonlyArray<ViewToggleOption<T>>;
    compact?: boolean;
    className?: string;
}

function ViewToggle<T extends string = ViewMode>({
    mode,
    onChange,
    options,
    compact = false,
    className = '',
}: ViewToggleProps<T>) {
    const { t } = useI18n();
    const defaultOptions: ReadonlyArray<ViewToggleOption<ViewMode>> = [
        { mode: 'visual', label: t('common.view.visual'), icon: Orbit },
        { mode: 'table', label: t('common.view.table'), icon: Table2 },
    ];
    const resolvedOptions =
        options ?? (defaultOptions as unknown as ReadonlyArray<ViewToggleOption<T>>);
    const classes = ['view-toggle', compact && 'view-toggle--compact', className]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={classes} role="group" aria-label={t('common.viewMode')}>
            {resolvedOptions.map((option) => {
                const Icon = option.icon;
                const isActive = mode === option.mode;
                return (
                    <button
                        key={option.mode}
                        type="button"
                        className={`view-toggle__option ${isActive ? 'view-toggle__option--active' : ''}`}
                        aria-pressed={isActive}
                        aria-label={option.label}
                        title={compact ? option.label : undefined}
                        onClick={() => onChange(option.mode)}
                    >
                        <Icon size={14} strokeWidth={1.5} />
                        {!compact && <span>{option.label}</span>}
                    </button>
                );
            })}
        </div>
    );
}

export default ViewToggle;
export type { ViewToggleProps, ViewToggleOption };

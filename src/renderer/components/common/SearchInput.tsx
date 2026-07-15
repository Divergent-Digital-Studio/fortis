import { type InputHTMLAttributes, forwardRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import '../../styles/components/search-input.css';

interface SearchInputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
    value: string;
    onChange: (value: string) => void;
    onClear?: () => void;
    compact?: boolean;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
    (
        {
            value,
            onChange,
            onClear,
            placeholder,
            compact = false,
            className = '',
            ...rest
        },
        ref,
    ) => {
        const { t } = useI18n();
        const resolvedPlaceholder = placeholder ?? t('common.searchPlaceholder');
        const handleChange = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                onChange(e.target.value);
            },
            [onChange],
        );

        const handleClear = useCallback(() => {
            onChange('');
            onClear?.();
        }, [onChange, onClear]);

        const wrapperClasses = [
            'search-input',
            compact && 'search-input--sm',
            className,
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <div className={wrapperClasses}>
                <input
                    ref={ref}
                    className="search-input__field"
                    type="text"
                    value={value}
                    onChange={handleChange}
                    placeholder={resolvedPlaceholder}
                    aria-label={resolvedPlaceholder}
                    {...rest}
                />
                <span className="search-input__icon">
                    <Search size={16} strokeWidth={1.5} />
                </span>
                {value.length > 0 && (
                    <button
                        className="search-input__clear"
                        onClick={handleClear}
                        type="button"
                        aria-label={t('common.clearSearch')}
                    >
                        <X size={14} strokeWidth={1.5} />
                    </button>
                )}
            </div>
        );
    },
);

SearchInput.displayName = 'SearchInput';

export default SearchInput;
export type { SearchInputProps };

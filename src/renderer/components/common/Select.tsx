import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import '../../styles/components/select.css';

interface SelectOption<T extends string> {
    value: T;
    label: string;
    disabled?: boolean;
}

interface SelectProps<T extends string> {
    value: T;
    options: ReadonlyArray<SelectOption<T>>;
    onChange: (value: T) => void;
    ariaLabel?: string;
    ariaLabelledBy?: string;
    id?: string;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}

function Select<T extends string>({
    value,
    options,
    onChange,
    ariaLabel,
    ariaLabelledBy,
    id,
    disabled = false,
    placeholder = 'Select…',
    className = '',
}: SelectProps<T>) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const generatedId = useId();
    const listboxId = `${id ?? generatedId}-listbox`;

    const selectedIndex = options.findIndex((o) => o.value === value);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

    const closeMenu = useCallback((focusButton: boolean) => {
        setOpen(false);
        if (focusButton) buttonRef.current?.focus();
    }, []);

    const positionMenu = useCallback(() => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMenuRect({ left: rect.left, top: rect.bottom + 4, width: rect.width });
    }, []);

    const openMenu = useCallback(() => {
        if (disabled) return;
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        positionMenu();
        setOpen(true);
    }, [disabled, selectedIndex, positionMenu]);

    const selectIndex = useCallback(
        (index: number) => {
            const option = options[index];
            if (!option || option.disabled) return;
            onChange(option.value);
            closeMenu(true);
        },
        [options, onChange, closeMenu],
    );

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (e: MouseEvent) => {
            const target = e.target as Node;
            const inRoot = rootRef.current?.contains(target);
            const inList = listRef.current?.contains(target);
            if (!inRoot && !inList) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [open]);

    useEffect(() => {
        if (open) {
            listRef.current?.focus();
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const reposition = (): void => positionMenu();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    }, [open, positionMenu]);

    const handleButtonKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                openMenu();
            }
        },
        [openMenu],
    );

    const nextEnabled = useCallback(
        (from: number, dir: 1 | -1) => {
            let i = from;
            for (let step = 0; step < options.length; step += 1) {
                i += dir;
                if (i < 0 || i > options.length - 1) return from;
                if (!options[i]?.disabled) return i;
            }
            return from;
        },
        [options],
    );

    const handleListKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setActiveIndex((i) => nextEnabled(i, 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setActiveIndex((i) => nextEnabled(i, -1));
                    break;
                case 'Home':
                    e.preventDefault();
                    setActiveIndex(options[0]?.disabled ? nextEnabled(0, 1) : 0);
                    break;
                case 'End':
                    e.preventDefault();
                    setActiveIndex(options[options.length - 1]?.disabled ? nextEnabled(options.length - 1, -1) : options.length - 1);
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    selectIndex(activeIndex);
                    break;
                case 'Escape':
                    e.preventDefault();
                    closeMenu(true);
                    break;
                case 'Tab':
                    setOpen(false);
                    break;
            }
        },
        [options, activeIndex, selectIndex, closeMenu, nextEnabled],
    );

    const rootClasses = ['ds-select', open && 'ds-select--open', disabled && 'ds-select--disabled', className]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={rootClasses} ref={rootRef}>
            <button
                type="button"
                id={id}
                ref={buttonRef}
                className="ds-select__trigger"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openMenu())}
                onKeyDown={handleButtonKeyDown}
            >
                <span className="ds-select__value">
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={14} strokeWidth={2} className="ds-select__chevron" />
            </button>

            {open && menuRect && createPortal(
                <ul
                    id={listboxId}
                    ref={listRef}
                    className="ds-select__list scrollbar-overlay"
                    role="listbox"
                    tabIndex={-1}
                    aria-label={ariaLabel}
                    aria-activedescendant={`${listboxId}-opt-${activeIndex}`}
                    onKeyDown={handleListKeyDown}
                    style={{ position: 'fixed', left: menuRect.left, top: menuRect.top, width: menuRect.width }}
                >
                    {options.map((option, index) => {
                        const isSelected = option.value === value;
                        const isActive = index === activeIndex;
                        const isDisabled = option.disabled === true;
                        const optionClasses = [
                            'ds-select__option',
                            isSelected && 'ds-select__option--selected',
                            isActive && !isDisabled && 'ds-select__option--active',
                            isDisabled && 'ds-select__option--disabled',
                        ]
                            .filter(Boolean)
                            .join(' ');

                        return (
                            <li
                                key={option.value}
                                id={`${listboxId}-opt-${index}`}
                                className={optionClasses}
                                role="option"
                                aria-selected={isSelected}
                                aria-disabled={isDisabled || undefined}
                                onMouseEnter={() => !isDisabled && setActiveIndex(index)}
                                onClick={() => selectIndex(index)}
                            >
                                {option.label}
                            </li>
                        );
                    })}
                </ul>,
                document.body,
            )}
        </div>
    );
}

export default Select;
export type { SelectProps, SelectOption };

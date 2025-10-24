import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface BarcodeOption {
  id: string | number;
  label: string;
  description?: string;
  hint?: string;
  quantityLabel?: string;
}

export interface BarcodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: BarcodeOption) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  options?: BarcodeOption[];
  error?: string | null;
  debounceMs?: number;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

const HIGHLIGHT_CLASS = 'bg-indigo-50 text-indigo-700';

const BarcodeInput: React.FC<BarcodeInputProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = '품목명, 품번, 바코드 검색',
  disabled,
  isLoading,
  options = [],
  error,
  debounceMs = 200,
}) => {
  const listRef = useRef<HTMLUListElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedOptions = useDebouncedValue(options, debounceMs);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedOptions]);

  const hasDropdown = isFocused && debouncedOptions.length > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!hasDropdown) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % debouncedOptions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + debouncedOptions.length) % debouncedOptions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = debouncedOptions[activeIndex];
      if (option && onSelect) {
        onSelect(option);
      }
    }
  };

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    const optionNode = listRef.current.children[activeIndex] as HTMLElement | undefined;
    if (optionNode) {
      optionNode.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const dropdown = useMemo(() => {
    if (!hasDropdown) {
      return null;
    }

    return (
      <ul
        ref={listRef}
        className="absolute z-10 mt-2 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        role="listbox"
      >
        {debouncedOptions.map((option, index) => {
          const isActive = index === activeIndex;
          return (
            <li
              key={option.id}
              role="option"
              aria-selected={isActive}
              className={`cursor-pointer px-4 py-3 text-sm transition ${
                isActive ? HIGHLIGHT_CLASS : 'text-slate-600 hover:bg-slate-50'
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect?.(option);
              }}
            >
              <div className="flex flex-col gap-1">
                <div className="font-semibold text-slate-800">{option.label}</div>
                {option.description ? (
                  <span className="text-xs text-slate-500">{option.description}</span>
                ) : null}
                {option.hint || option.quantityLabel ? (
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
                    <span>{option.hint}</span>
                    <span className="font-semibold text-indigo-500">{option.quantityLabel}</span>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }, [activeIndex, debouncedOptions, hasDropdown, onSelect]);

  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
        <span className="h-4 w-4 rounded-full border border-slate-300 bg-slate-100" aria-hidden />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        {isLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border border-slate-300 border-t-transparent" aria-hidden />
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-rose-500">{error}</p> : null}
      {dropdown}
    </div>
  );
};

export default BarcodeInput;

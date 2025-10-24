import * as React from 'react';
import { ko } from '@/src/i18n/ko';

interface SearchConfig {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}

interface Option {
  value: string;
  label: string;
}

interface StatusFilterConfig {
  label?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}

interface DateRangeConfig {
  from?: string;
  to?: string;
  onChange: (range: { from?: string; to?: string }) => void;
}

interface ToolbarProps {
  search?: SearchConfig;
  statusFilter?: StatusFilterConfig;
  dateRange?: DateRangeConfig;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  search,
  statusFilter,
  dateRange,
  actions,
  children,
  className = '',
}) => {
  const handleSearchSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    search?.onSubmit?.();
  };

  return (
    <div
      className={[
        'flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white px-6 py-4 shadow-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-1 flex-wrap items-center gap-4">
        {search ? (
          <form
            onSubmit={handleSearchSubmit}
            className="relative w-full max-w-xs"
            role="search"
          >
            <label htmlFor="toolbar-search" className="sr-only">
              {ko.common.searchLabel}
            </label>
            <input
              id="toolbar-search"
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder ?? ko.common.search}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-inner transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-4 w-4"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3-3" />
              </svg>
            </span>
          </form>
        ) : null}

        {statusFilter ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>{statusFilter.label ?? ko.common.status}</span>
            <select
              value={statusFilter.value}
              onChange={(event) => statusFilter.onChange(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              {statusFilter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {dateRange ? (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              <span>{ko.common.start}</span>
              <input
                type="date"
                value={dateRange.from ?? ''}
                onChange={(event) =>
                  dateRange.onChange({ from: event.target.value || undefined, to: dateRange.to })
                }
                placeholder="예: 2024-01-01"
                aria-label="시작일 (yyyy-mm-dd 형식)"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <span className="text-slate-400">~</span>
            <label className="flex items-center gap-2">
              <span>{ko.common.end}</span>
              <input
                type="date"
                value={dateRange.to ?? ''}
                onChange={(event) =>
                  dateRange.onChange({ from: dateRange.from, to: event.target.value || undefined })
                }
                placeholder="예: 2024-01-01"
                aria-label="종료일 (yyyy-mm-dd 형식)"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>
        ) : null}

        {children}
      </div>

      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
};

export default Toolbar;

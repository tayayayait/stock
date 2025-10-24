import React, { useMemo } from 'react';
import { NavLink, useLocation, useNavigation } from 'react-router-dom';

type NavTarget = {
  pathname: string;
  search?: string;
};

interface NavItem {
  id: string;
  label: string;
  to: NavTarget;
  end?: boolean;
  children?: Array<{
    id: string;
    label: string;
    to: NavTarget;
  }>;
}

type NavChild = NonNullable<NavItem['children']>[number];

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', to: { pathname: '/' }, end: true },
  { id: 'items', label: 'Items (상품)', to: { pathname: '/items' } },
  {
    id: 'sales',
    label: 'Sales',
    to: { pathname: '/sales' },
    children: [
      { id: 'sales-all', label: 'All Orders', to: { pathname: '/sales' } },
      {
        id: 'sales-picking',
        label: 'Picking Orders',
        to: { pathname: '/sales', search: '?status=picking' },
      },
      {
        id: 'sales-packed',
        label: 'Packed Orders',
        to: { pathname: '/sales', search: '?status=packed' },
      },
      {
        id: 'sales-shipped',
        label: 'Shipped Orders',
        to: { pathname: '/sales', search: '?status=shipped' },
      },
    ],
  },
  { id: 'packages', label: 'Packages (출하/배송)', to: { pathname: '/packages' } },
  { id: 'reports', label: 'Reports', to: { pathname: '/reports' } },
];

const resolvePendingKey = (target: NavTarget) => target.pathname;

const buildLinkClassName = (isActive: boolean, isPending: boolean, variant: 'primary' | 'child') => {
  const base =
    'flex w-full items-center justify-between rounded-xl px-4 py-2 text-left text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1';

  const variantClasses =
    variant === 'primary'
      ? isActive
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
        : 'text-slate-600 hover:bg-slate-100/80'
      : isActive
        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
        : 'text-slate-500 hover:bg-slate-100/70';

  const pending = isPending ? 'pointer-events-none opacity-80' : '';

  return [base, variantClasses, pending].filter(Boolean).join(' ');
};

const SideNav: React.FC = () => {
  const items = useMemo(() => navItems, []);
  const navigation = useNavigation();
  const pendingPath = navigation.state !== 'idle' ? navigation.location?.pathname : null;
  const location = useLocation();

  const isChildActive = React.useCallback(
    (child: NavChild) => {
      if (location.pathname !== child.to.pathname) {
        return false;
      }

      const currentParams = new URLSearchParams(location.search);

      if (!child.to.search) {
        const status = currentParams.get('status');
        return !status || status === 'all';
      }

      const targetParams = new URLSearchParams(child.to.search);

      return Array.from(targetParams.entries()).every(
        ([key, value]) => currentParams.get(key) === value,
      );
    },
    [location.pathname, location.search],
  );

  return (
    <aside className="hidden w-64 border-r border-slate-200 bg-white/90 backdrop-blur lg:block">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-semibold text-white">
            SW
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Stockwise</p>
            <p className="text-xs text-slate-500">Inventory Intelligence</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <nav className="space-y-3">
            {items.map((item) => {
              const itemPending = pendingPath === resolvePendingKey(item.to);

              return (
                <div key={item.id} className="space-y-1">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      buildLinkClassName(isActive, itemPending, 'primary')
                    }
                    aria-disabled={itemPending}
                    data-pending={itemPending || undefined}
                  >
                    {({ isActive }) => (
                      <>
                        <span className="flex items-center gap-2">
                          <span>{item.label}</span>
                          {itemPending ? (
                            <span className="h-2 w-2 animate-ping rounded-full bg-white" aria-hidden="true" />
                          ) : null}
                        </span>
                        {isActive && !itemPending ? (
                          <span className="text-xs font-semibold uppercase tracking-wide">Now</span>
                        ) : null}
                      </>
                    )}
                  </NavLink>

                  {item.children?.length ? (
                    <div className="space-y-1 border-l border-slate-200 pl-4">
                      {item.children.map((child) => {
                        const childPending = pendingPath === resolvePendingKey(child.to);
                        const childActive = isChildActive(child);

                        return (
                          <NavLink
                            key={child.id}
                            to={child.to}
                            className={() => buildLinkClassName(childActive, childPending, 'child')}
                            aria-disabled={childPending}
                            data-pending={childPending || undefined}
                          >
                            <span className="flex items-center gap-2 text-xs font-medium">
                              <span>{child.label}</span>
                              {childPending ? (
                                <span
                                  className="h-1.5 w-1.5 animate-ping rounded-full bg-blue-400"
                                  aria-hidden="true"
                                />
                              ) : null}
                              {childActive && !childPending ? (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-tight text-blue-700">
                                  Active
                                </span>
                              ) : null}
                            </span>
                          </NavLink>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
};

export default SideNav;

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ── Icons (inline SVG, 15×15) ─────────────────────────────────────────────────

function IconUser() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4l3 3" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="14" rx="2" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <line x1="9" y1="13" x2="9.01" y2="13" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7h1m4 0h1m-5 4h1m4 0h1m-5 4h1m4 0h1" />
    </svg>
  );
}

function IconPuzzle() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <line x1="16" y1="8" x2="2" y2="22" />
      <line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

// ── Nav items config ──────────────────────────────────────────────────────────

interface NavItem {
  tab: string;
  label: string;
  Icon: () => JSX.Element;
  badge?: string;
}

const PERSONAL_NAV: NavItem[] = [
  { tab: 'account',       label: 'Account',       Icon: IconUser },
  { tab: 'notifications', label: 'Notifications',  Icon: IconBell },
  { tab: 'general',       label: 'App & Display',  Icon: IconSun },
  { tab: 'status',        label: 'Status',         Icon: IconActivity },
  { tab: 'sessions',      label: 'Sessions',       Icon: IconShield },
  { tab: 'tokens',        label: 'API Tokens',     Icon: IconKey },
  { tab: 'data',          label: 'Data',           Icon: IconDatabase },
];

const HOTBOX_NAV: NavItem[] = [
  { tab: 'agents', label: 'Agents', Icon: IconBot },
];

const WORKSPACE_NAV: NavItem[] = [
  { tab: 'workspace',    label: 'Workspace',    Icon: IconBuilding },
  { tab: 'integrations', label: 'Integrations', Icon: IconPuzzle, badge: 'v2' },
];

function SidebarGroup({ title, items }: { title: string; items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="mb-5">
      <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--hotbox-text-dim)]">
        {title}
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map(({ tab, label, Icon, badge }) => {
          const active = pathname === `/settings/${tab}`;
          return (
            <Link
              key={tab}
              href={`/settings/${tab}`}
              className={[
                'flex items-center gap-[9px] px-[10px] py-[7px] rounded-[7px] text-[13px] transition-colors duration-100',
                active
                  ? 'bg-[var(--hotbox-selected)] text-[var(--hotbox-text)] font-medium'
                  : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface-hover)] hover:text-[var(--hotbox-text)]',
              ].join(' ')}
            >
              <Icon />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className="text-[9px] px-[5px] py-[1px] rounded-[4px] bg-[rgba(90,218,238,0.10)] text-[var(--hotbox-accent)]">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ── Report a Problem link at bottom ──────────────────────────────────────────

function ReportLink() {
  const pathname = usePathname();
  const active = pathname === '/settings/report';
  return (
    <div className="mt-auto pt-4 border-t border-[var(--hotbox-border)]">
      <Link
        href="/settings/report"
        className={[
          'flex items-center gap-[9px] px-[10px] py-[7px] rounded-[7px] text-[13px] transition-colors duration-100',
          active
            ? 'bg-[var(--hotbox-selected)] text-[var(--hotbox-text)] font-medium'
            : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface-hover)] hover:text-[var(--hotbox-text)]',
        ].join(' ')}
      >
        <IconFlag />
        Report a Problem
      </Link>
    </div>
  );
}

// ── Exported sidebar ──────────────────────────────────────────────────────────

export function SettingsSidebar() {
  return (
    <aside
      className="flex flex-col h-full py-6 px-3 overflow-y-auto"
      style={{
        width: 220,
        minWidth: 220,
        borderRight: '1px solid var(--hotbox-border)',
        background: 'var(--hotbox-surface)',
      }}
    >
      <div className="px-2 mb-6">
        <h1 className="text-[15px] font-semibold text-[var(--hotbox-text)]">Settings</h1>
      </div>

      <SidebarGroup title="Personal" items={PERSONAL_NAV} />
      <SidebarGroup title="Hotbox" items={HOTBOX_NAV} />
      <SidebarGroup title="Workspace" items={WORKSPACE_NAV} />

      <ReportLink />
    </aside>
  );
}

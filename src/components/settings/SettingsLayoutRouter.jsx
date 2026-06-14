import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import {
  User,
  Palette,
  Keyboard,
  Bot,
  Mic,
  Bell,
  Terminal,
  Key,
  Plus,
  Settings,
  Zap,
  Cpu,
} from 'lucide-react';
import { UiShell, UiHeader } from '@/components/ui/system';

const navItems = [
  { name: 'Account', hint: 'Profile and billing', path: 'account', icon: User },
  { name: 'Appearance', hint: 'Theme and display', path: 'appearance', icon: Palette },
  {
    name: 'LLM Providers',
    hint: 'Configure AI providers',
    path: 'llm-providers',
    icon: Cpu,
  },
  { name: 'Shortcuts', hint: 'Keyboard bindings', path: 'shortcuts', icon: Keyboard },
  { name: 'AI Agents', hint: 'Default coding agent', path: 'agents', icon: Bot },
  { name: 'BridgeVoice', hint: 'Voice to text dictation', path: 'voice', icon: Mic },
  { name: 'Notifications', hint: 'Sounds and alerts', path: 'notifications', icon: Bell },
  { name: 'CLI', hint: 'Install bridge command', path: 'cli', icon: Terminal },
  { name: 'API Keys', hint: 'Create and manage keys', path: 'keys', icon: Key },
];

const ROUTE_TITLES = {
  account: 'Account',
  appearance: 'Appearance',
  'llm-providers': 'LLM Providers',
  shortcuts: 'Shortcuts',
  agents: 'AI Agents',
  voice: 'BridgeVoice',
  notifications: 'Notifications',
  cli: 'CLI',
  keys: 'API Keys',
};

function titleForPathname(pathname) {
  if (!pathname) return 'Settings';
  const routePrefix = pathname.split('/').slice(-1)[0];
  if (ROUTE_TITLES[routePrefix]) return ROUTE_TITLES[routePrefix];
  for (const prefix of Object.keys(ROUTE_TITLES)) {
    if (pathname.endsWith(prefix) || pathname.includes(`/${prefix}`)) return ROUTE_TITLES[prefix];
  }
  return 'Settings';
}

export default function SettingsLayoutRouter() {
  const { projectId } = useParams();
  const location = useLocation();
  const pathname = location.pathname;

  const basePath = `/project/${projectId}/settings`;

  return (
    <UiShell
      className="h-screen"
      style={{
        color: 'var(--text-primary)',
        background:
          'radial-gradient(1200px 420px at 78% -10%, color-mix(in srgb, var(--accent-primary) 12%, transparent), transparent 70%), var(--surface-app)',
      }}
    >
      <aside
        className="w-72 border-r flex flex-col h-full flex-shrink-0"
        style={{
          background: 'color-mix(in srgb, var(--surface-card) 78%, black)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
            style={{
              background: 'color-mix(in srgb, var(--surface-elevated) 84%, transparent)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <Settings size={12} />
            Settings
          </button>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No workspaces open
            </p>
            <button
              type="button"
              aria-label="Create workspace"
              className="h-7 w-7 grid place-items-center rounded-md"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
          <p
            className="text-xs tracking-[0.18em] uppercase mt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            DevHub
          </p>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const href = `${basePath}/${item.path}`;
            const isActive =
              pathname === href || (pathname?.startsWith(href) && item.path !== 'appearance');
            return (
              <Link
                key={item.name}
                to={href}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive ? 'font-medium' : 'hover:text-[var(--text-primary)]'
                }`}
                style={{
                  background: isActive
                    ? 'linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 18%, transparent), color-mix(in srgb, var(--surface-elevated) 88%, transparent))'
                    : 'transparent',
                  border: isActive
                    ? '1px solid color-mix(in srgb, var(--accent-primary) 28%, var(--border-subtle))'
                    : '1px solid transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <span
                  className="h-8 w-8 rounded-lg grid place-items-center"
                  style={{
                    background: isActive
                      ? 'color-mix(in srgb, var(--accent-primary) 18%, transparent)'
                      : 'color-mix(in srgb, var(--surface-elevated) 70%, transparent)',
                    border: isActive
                      ? '1px solid color-mix(in srgb, var(--accent-primary) 34%, transparent)'
                      : '1px solid var(--border-subtle)',
                  }}
                >
                  <Icon
                    size={15}
                    style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block leading-tight">{item.name}</span>
                  <span
                    className="block text-[11px] leading-tight mt-0.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {item.hint}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
      </aside>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <UiHeader sticky data-testid="ui-header">
          <UiHeader.Title>{titleForPathname(pathname)}</UiHeader.Title>
          <UiHeader.Actions>
            <button
              type="button"
              className="h-8 px-3 rounded-full text-[11px] font-medium"
              style={{
                background: 'color-mix(in srgb, var(--surface-elevated) 86%, transparent)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              BRIDGEVOICE #
            </button>
            <button
              type="button"
              className="h-8 w-8 rounded-full grid place-items-center"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
              aria-label="Quick actions"
            >
              <Zap size={14} style={{ color: 'var(--accent-primary)' }} />
            </button>
          </UiHeader.Actions>
        </UiHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        </div>
      </div>
    </UiShell>
  );
}

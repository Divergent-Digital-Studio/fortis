import {
    LayoutDashboard,
    Network,
    ShieldAlert,
    Settings,
    Shield,
    Wifi,
    Globe,
    Globe2,
    Cctv,
    FileText,
    Workflow,
    ShieldCheck,
    Activity,
    Radio,
    Users,
    Share2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore, useAlertStore, useSettingsStore, selectTier } from '../../stores';
import { useI18n } from '../../i18n';
import { Badge } from '../common';
import useWindowSize from '../../hooks/useWindowSize';
import { TIER_LABELS } from '@shared/types/ipc';
import type { ViewType } from '../../types';
import logoUrl from '../../assets/logo.png';
import '../../styles/components/sidebar.css';

interface NavItem {
    view: ViewType;
    label: string;
    icon: LucideIcon;
    badge?: string;
}

const NAV_ITEMS: NavItem[] = [
    { view: 'overview', label: 'Overview', icon: LayoutDashboard },
    { view: 'connections', label: 'Connections', icon: Network },
    { view: 'flow', label: 'Flow', icon: Workflow },
    { view: 'devices', label: 'Devices', icon: Wifi },
    { view: 'dns', label: 'DNS', icon: Globe },
    { view: 'geo', label: 'Geo Map', icon: Globe2 },
    { view: 'iot', label: 'IoT', icon: Cctv },
    { view: 'reports', label: 'Reports', icon: FileText },
    { view: 'defense', label: 'Defense', icon: ShieldCheck },
    { view: 'bandwidth', label: 'Bandwidth', icon: Activity },
    { view: 'remote', label: 'Remote', icon: Radio },
    { view: 'admin', label: 'Admin', icon: Users },
    { view: 'community', label: 'Community', icon: Share2 },
    { view: 'alerts', label: 'Alerts', icon: ShieldAlert },
    { view: 'settings', label: 'Settings', icon: Settings },
];

function Sidebar() {
    const { t } = useI18n();
    const activeView = useUIStore((state) => state.activeView);
    const setActiveView = useUIStore((state) => state.setActiveView);
    const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
    const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
    const { isCollapsed: windowCollapsed } = useWindowSize();
    const unacknowledgedCount = useAlertStore(
        (state) => state.alertCounts.unacknowledged,
    );
    const tier = useSettingsStore(selectTier);

    const collapsed = sidebarCollapsed || windowCollapsed;

    const handleNavClick = (view: ViewType) => {
        setActiveView(view);
    };

    const handleLogoClick = () => {
        if (!windowCollapsed) {
            setSidebarCollapsed(!sidebarCollapsed);
        }
    };

    return (
        <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
            <div
                className="sidebar__logo"
                onClick={handleLogoClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleLogoClick();
                }}
            >
                <img
                    src={logoUrl}
                    alt=""
                    width={41}
                    height={41}
                    className="sidebar__logo-icon"
                />
                <span className="sidebar__logo-text">Fortis</span>
            </div>

            <nav className="sidebar__nav" aria-label="Main navigation">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.view;
                    const label = t(`nav.${item.view}`);

                    return (
                        <button
                            key={item.view}
                            className={`sidebar__nav-item${isActive ? ' sidebar__nav-item--active' : ''}`}
                            onClick={() => handleNavClick(item.view)}
                            aria-current={isActive ? 'page' : undefined}
                            title={collapsed ? label : undefined}
                        >
                            <span className="sidebar__nav-icon">
                                <Icon size={20} strokeWidth={1.5} />
                                {item.view === 'alerts' &&
                                    unacknowledgedCount > 0 &&
                                    collapsed && (
                                        <span
                                            className="sidebar__alert-dot"
                                            aria-label={`${unacknowledgedCount} unacknowledged alerts`}
                                        />
                                    )}
                            </span>
                            <span className="sidebar__nav-label">
                                {label}
                            </span>
                            {item.view === 'alerts' &&
                                unacknowledgedCount > 0 ? (
                                <span className="sidebar__nav-badge">
                                    <Badge
                                        variant="danger"
                                        size="sm"
                                        showIcon={false}
                                    >
                                        {unacknowledgedCount > 99
                                            ? '99+'
                                            : unacknowledgedCount}
                                    </Badge>
                                </span>
                            ) : (
                                item.badge && (
                                    <span className="sidebar__nav-badge">
                                        <Badge
                                            variant="neutral"
                                            size="sm"
                                            showIcon={false}
                                        >
                                            {item.badge}
                                        </Badge>
                                    </span>
                                )
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className="sidebar__footer">
                <Badge variant="safe" size="sm" icon={Shield}>
                    {collapsed ? '' : TIER_LABELS[tier]}
                </Badge>
            </div>
        </aside>
    );
}

export default Sidebar;

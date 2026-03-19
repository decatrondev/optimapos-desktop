import React from 'react';
import { Role } from '../types/order';

export type ActiveView = 'dashboard' | 'kitchen' | 'pos' | 'orders' | 'delivery' | 'cash';

/** Permission module required for each view */
export const VIEW_PERMISSIONS: Record<ActiveView, string> = {
    dashboard: 'reports',
    kitchen: 'kitchen_view',
    pos: 'pos',
    orders: 'orders',
    delivery: 'delivery_view',
    cash: 'cash_management',
};

interface NavItem {
    key: ActiveView;
    label: string;
    icon: string;
    roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['ADMIN', 'MANAGER'] },
    { key: 'pos', label: 'POS', icon: '🛒', roles: ['ADMIN', 'MANAGER', 'VENDOR'] },
    { key: 'kitchen', label: 'Cocina', icon: '🔥', roles: ['ADMIN', 'MANAGER', 'KITCHEN'] },
    { key: 'orders', label: 'Pedidos', icon: '📋', roles: ['ADMIN', 'MANAGER', 'VENDOR'] },
    { key: 'delivery', label: 'Delivery', icon: '🛵', roles: ['ADMIN', 'MANAGER', 'DELIVERY'] },
    { key: 'cash', label: 'Caja', icon: '💰', roles: ['ADMIN', 'MANAGER', 'VENDOR'] },
];

interface ViewNavBarProps {
    currentView: ActiveView;
    onNavigate: (view: ActiveView) => void;
    userRole: Role;
    badges?: Partial<Record<ActiveView, number>>;
    hasPermission?: (module: string, action: 'read' | 'write') => boolean;
}

export const ViewNavBar: React.FC<ViewNavBarProps> = ({ currentView, onNavigate, userRole, badges, hasPermission }) => {
    const visibleItems = NAV_ITEMS.filter(item => {
        if (!item.roles.includes(userRole)) return false;
        if (userRole === 'ADMIN' || userRole === 'MANAGER') return true;
        if (hasPermission) {
            const mod = VIEW_PERMISSIONS[item.key];
            return hasPermission(mod, 'read');
        }
        return true;
    });

    if (visibleItems.length <= 1) return null;

    return (
        <nav className="view-nav">
            {visibleItems.map(item => (
                <button
                    key={item.key}
                    className={`view-nav__item ${currentView === item.key ? 'view-nav__item--active' : ''}`}
                    onClick={() => onNavigate(item.key)}
                >
                    <span className="view-nav__icon">{item.icon}</span>
                    <span className="view-nav__label">{item.label}</span>
                    {badges?.[item.key] !== undefined && badges[item.key]! > 0 && (
                        <span className="view-nav__badge">{badges[item.key]}</span>
                    )}
                </button>
            ))}
        </nav>
    );
};

/** Get the default view for a given role */
export function getDefaultView(role: Role): ActiveView {
    switch (role) {
        case 'ADMIN':
        case 'MANAGER':
            return 'dashboard';
        case 'KITCHEN':
            return 'kitchen';
        case 'DELIVERY':
            return 'delivery';
        case 'VENDOR':
            return 'pos';
        default:
            return 'pos';
    }
}

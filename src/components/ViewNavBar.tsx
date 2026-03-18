import React from 'react';
import { Role } from '../types/order';

export type ActiveView = 'dashboard' | 'kitchen' | 'orders' | 'delivery' | 'cash';

interface NavItem {
    key: ActiveView;
    label: string;
    icon: string;
    roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['ADMIN', 'MANAGER'] },
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
}

export const ViewNavBar: React.FC<ViewNavBarProps> = ({ currentView, onNavigate, userRole, badges }) => {
    const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(userRole));

    // Don't render if only 1 item (single-role users like KITCHEN see only kitchen)
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
            return 'orders';
        default:
            return 'orders';
    }
}

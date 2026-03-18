import React from 'react';
import { Location } from '../types/order';

interface LocationPickerProps {
    locations: Location[];
    storeName: string;
    onSelect: (location: Location) => void;
    showAllOption?: boolean;
    onSelectAll?: () => void;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ locations, storeName, onSelect, showAllOption, onSelectAll }) => {
    return (
        <div className="login-screen">
            <div className="login-screen__bg-orb login-screen__bg-orb--1" />
            <div className="login-screen__bg-orb login-screen__bg-orb--2" />
            <div className="login-screen__bg-orb login-screen__bg-orb--3" />

            <div className="login-card">
                <div className="login-card__header">
                    <span className="login-card__logo">📍</span>
                    <h1 className="login-card__title">{storeName}</h1>
                    <p className="login-card__subtitle">Selecciona tu Local</p>
                </div>

                <div className="login-card__form">
                    <div className="printer-setup__grid">
                        {showAllOption && onSelectAll && (
                            <button
                                className="printer-setup__option printer-setup__option--all"
                                onClick={onSelectAll}
                            >
                                <span className="printer-setup__option-icon">🌐</span>
                                <span className="printer-setup__option-name">Todos los Locales</span>
                                <span className="printer-setup__option-type">Ver pedidos de todas las sucursales</span>
                            </button>
                        )}
                        {locations.map((loc) => (
                            <button
                                key={loc.id}
                                className="printer-setup__option"
                                onClick={() => onSelect(loc)}
                            >
                                <span className="printer-setup__option-icon">🏪</span>
                                <span className="printer-setup__option-name">{loc.name}</span>
                                {loc.address && (
                                    <span className="printer-setup__option-type">{loc.address}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

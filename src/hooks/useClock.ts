import { useState, useEffect } from 'react';

export function useClock(): string {
    const [time, setTime] = useState(() => formatTime());

    useEffect(() => {
        const interval = setInterval(() => {
            setTime(formatTime());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return time;
}

function formatTime(): string {
    return new Date().toLocaleTimeString('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

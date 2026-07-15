export type PowerEvent = 'suspend' | 'resume' | 'on-ac' | 'on-battery';

export interface PowerSource {
    isOnBattery(): boolean;
    getIdleSeconds(): number;
    on(event: PowerEvent, listener: () => void): void;
    off(event: PowerEvent, listener: () => void): void;
}

export function createNoopPowerSource(): PowerSource {
    return {
        isOnBattery: () => false,
        getIdleSeconds: () => 0,
        on: () => undefined,
        off: () => undefined,
    };
}

interface ElectronPowerMonitor {
    isOnBatteryPower(): boolean;
    getSystemIdleTime(): number;
    on(event: string, cb: () => void): void;
    off(event: string, cb: () => void): void;
}

export function createElectronPowerSource(): PowerSource {
    const getMonitor = (): ElectronPowerMonitor | null => {
        try {
            return (require('electron') as { powerMonitor: ElectronPowerMonitor }).powerMonitor;
        } catch {
            return null;
        }
    };
    return {
        isOnBattery: () => {
            try {
                return getMonitor()?.isOnBatteryPower() ?? false;
            } catch {
                return false;
            }
        },
        getIdleSeconds: () => {
            try {
                return getMonitor()?.getSystemIdleTime() ?? 0;
            } catch {
                return 0;
            }
        },
        on: (event, listener) => {
            try {
                getMonitor()?.on(event, listener);
            } catch {
                /* power events unavailable */
            }
        },
        off: (event, listener) => {
            try {
                getMonitor()?.off(event, listener);
            } catch {
                /* power events unavailable */
            }
        },
    };
}

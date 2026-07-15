import type { LicenseStatus } from '@shared/types/settings';

export const FREE_LICENSE_STATUS: LicenseStatus = {
    tier: 'free',
    valid: false,
    reason: 'no-license',
    expiresAt: null,
    machineLocked: false,
    customerId: null,
    seatCount: null,
};

export const PURCHASE_URL = 'https://fortis.app/buy';

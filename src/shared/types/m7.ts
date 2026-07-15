import type { ThreatLevel } from './analysis';

export type SupportedLocale = 'en' | 'es' | 'fr' | 'de' | 'fa' | 'ar';

export type TextDirection = 'ltr' | 'rtl';

export interface CommunityState {
    enabled: boolean;
    configured: boolean;
    verified: boolean;
    severityFloor: ThreatLevel;
    submittedCount: number;
    lastSubmittedAt: number | null;
}

export interface ThreatIntelSubmission {
    destHash: string;
    destPort: number | null;
    threatLevel: ThreatLevel;
    category: string;
    bucketedAt: number;
}

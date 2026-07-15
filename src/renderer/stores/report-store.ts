import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { WeeklyReport } from '@shared/types/m2';

interface ReportState {
    reports: WeeklyReport[];
}

interface ReportActions {
    setReports: (reports: WeeklyReport[]) => void;
}

type ReportStore = ReportState & ReportActions;

export const useReportStore = create<ReportStore>()(
    subscribeWithSelector((set) => ({
        reports: [],
        setReports: (reports) => set({ reports }),
    })),
);

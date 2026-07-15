import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { DnsQueryRecord } from '@shared/types/m1';

interface DnsState {
    records: DnsQueryRecord[];
}

interface DnsActions {
    setRecords: (records: DnsQueryRecord[]) => void;
}

type DnsStore = DnsState & DnsActions;

export const useDnsStore = create<DnsStore>()(
    subscribeWithSelector((set) => ({
        records: [],
        setRecords: (records) => set({ records }),
    })),
);

import { create } from 'zustand';

export type DayFilter = number | 'all';

interface ViewStore {
  dayFilter: DayFilter;
  setDayFilter: (next: DayFilter) => void;
  /** Mobile-only: whether the IntelPanel drawer is open. */
  mobilePanelOpen: boolean;
  setMobilePanelOpen: (open: boolean) => void;
  toggleMobilePanel: () => void;
}

const useViewStore = create<ViewStore>((set) => ({
  dayFilter: 'all',
  setDayFilter: (next) => set({ dayFilter: next }),
  mobilePanelOpen: false,
  setMobilePanelOpen: (open) => set({ mobilePanelOpen: open }),
  toggleMobilePanel: () => set((s) => ({ mobilePanelOpen: !s.mobilePanelOpen })),
}));

export default useViewStore;

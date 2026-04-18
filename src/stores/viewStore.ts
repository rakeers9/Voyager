import { create } from 'zustand';

export type DayFilter = number | 'all';

interface ViewStore {
  dayFilter: DayFilter;
  setDayFilter: (next: DayFilter) => void;
}

const useViewStore = create<ViewStore>((set) => ({
  dayFilter: 'all',
  setDayFilter: (next) => set({ dayFilter: next }),
}));

export default useViewStore;

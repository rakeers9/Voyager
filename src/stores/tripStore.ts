import { create } from 'zustand';
import type { Segment, SegmentDetails } from '@/types/segment';
import type { Trip, TripStats } from '@/types/trip';

export interface SegmentPatch {
  title?: string;
  details?: Partial<SegmentDetails>;
}

export interface TripPatch {
  title?: string;
  description?: string;
}

interface TripStore {
  trip: Trip | null;
  segments: Segment[];
  stats: TripStats | null;
  getSegment: (index: number) => Segment | null;
  loadTrip: (trip: Trip, segments: Segment[], stats: TripStats) => void;
  clearTrip: () => void;
  updateSegment: (id: string, patch: SegmentPatch) => void;
  updateTrip: (patch: TripPatch) => void;
}

const useTripStore = create<TripStore>((set, get) => ({
  trip: null,
  segments: [],
  stats: null,
  getSegment: (index: number) => get().segments[index] ?? null,
  loadTrip: (trip, segments, stats) => set({ trip, segments, stats }),
  clearTrip: () => set({ trip: null, segments: [], stats: null }),
  updateSegment: (id, patch) =>
    set((state) => ({
      segments: state.segments.map((s) => {
        if (s.id !== id) return s;
        const merged = {
          ...s,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          details: patch.details ? { ...s.details, ...patch.details } : s.details,
        };
        return merged as Segment;
      }),
    })),
  updateTrip: (patch) =>
    set((state) => ({
      trip: state.trip ? { ...state.trip, ...patch } : state.trip,
    })),
}));

export default useTripStore;

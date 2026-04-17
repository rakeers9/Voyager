import { create } from 'zustand';
import { seedTrip, seedSegments, tripStats } from '@/data/seedTrip';
import type { Segment } from '@/types/segment';
import type { Trip, TripStats } from '@/types/trip';

interface TripStore {
  trip: Trip;
  segments: Segment[];
  stats: TripStats;
  getSegment: (index: number) => Segment | null;
}

const useTripStore = create<TripStore>((_, get) => ({
  trip: seedTrip,
  segments: seedSegments,
  stats: tripStats,
  getSegment: (index: number) => get().segments[index] ?? null,
}));

export default useTripStore;

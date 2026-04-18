import { create } from 'zustand';
import { computeTripStats } from '@/lib/tripBuilder';
import type { Segment } from '@/types/segment';
import type { Trip, TripStats } from '@/types/trip';
import useTripStore from './tripStore';
import usePlaybackStore from './playbackStore';

export interface SavedTrip {
  trip: Trip;
  segments: Segment[];
  stats: TripStats;
}

interface TripsListStore {
  trips: SavedTrip[];
  activeTripId: string | null;
  loaded: boolean;

  addTrip: (trip: Trip, segments: Segment[], stats: TripStats) => void;
  addDraftTrip: (trip: Trip) => void;
  switchToTrip: (tripId: string) => void;
  removeTrip: (tripId: string) => void;
  deleteTrip: (tripId: string) => Promise<boolean>;
  renameTrip: (tripId: string, title: string) => Promise<boolean>;
  loadFromSupabase: () => Promise<void>;
}

const useTripsListStore = create<TripsListStore>((set, get) => ({
  trips: [],
  activeTripId: null,
  loaded: false,

  addTrip: (trip, segments, stats) => {
    set((s) => ({
      trips: [...s.trips.filter((t) => t.trip.id !== trip.id), { trip, segments, stats }],
    }));
  },

  addDraftTrip: (trip) => {
    const stats = computeTripStats([], 1);
    set((s) => ({
      trips: [...s.trips.filter((t) => t.trip.id !== trip.id), { trip, segments: [], stats }],
    }));
  },

  switchToTrip: (tripId) => {
    const { trips } = get();
    const found = trips.find((t) => t.trip.id === tripId);
    if (!found) return;

    useTripStore.getState().loadTrip(found.trip, found.segments, found.stats);
    usePlaybackStore.getState().reinitialize();
    set({ activeTripId: tripId });
  },

  removeTrip: (tripId) => {
    set((s) => ({
      trips: s.trips.filter((t) => t.trip.id !== tripId),
    }));
  },

  deleteTrip: async (tripId) => {
    const res = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
    if (!res.ok) return false;

    const { trips, activeTripId } = get();
    const remaining = trips.filter((t) => t.trip.id !== tripId);

    if (activeTripId === tripId && remaining.length > 0) {
      const next = remaining[remaining.length - 1];
      useTripStore.getState().loadTrip(next.trip, next.segments, next.stats);
      usePlaybackStore.getState().reinitialize();
      set({ trips: remaining, activeTripId: next.trip.id });
    } else {
      set({
        trips: remaining,
        activeTripId: activeTripId === tripId ? null : activeTripId,
      });
    }
    return true;
  },

  renameTrip: async (tripId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return false;

    // Optimistic update
    const { trips } = get();
    const prev = trips.find((t) => t.trip.id === tripId);
    if (!prev) return false;

    set({
      trips: trips.map((t) =>
        t.trip.id === tripId ? { ...t, trip: { ...t.trip, title: trimmed } } : t
      ),
    });

    // Sync tripStore if this is the active trip
    const activeTrip = useTripStore.getState().trip;
    if (activeTrip && activeTrip.id === tripId) {
      useTripStore.setState({ trip: { ...activeTrip, title: trimmed } });
    }

    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error('rename failed');
      return true;
    } catch {
      // Revert on failure
      set((s) => ({
        trips: s.trips.map((t) => (t.trip.id === tripId ? prev : t)),
      }));
      if (activeTrip && activeTrip.id === tripId) {
        useTripStore.setState({ trip: activeTrip });
      }
      return false;
    }
  },

  loadFromSupabase: async () => {
    try {
      // Fetch trip list
      const listRes = await fetch('/api/trips');
      if (!listRes.ok) return; // Not logged in or error

      const tripsData = await listRes.json();
      if (!Array.isArray(tripsData) || tripsData.length === 0) {
        set({ loaded: true });
        return;
      }

      // Fetch full data for each trip
      const savedTrips: SavedTrip[] = [];
      for (const t of tripsData) {
        const detailRes = await fetch(`/api/trips/${t.id}`);
        if (!detailRes.ok) continue;
        const { trip, segments } = await detailRes.json();

        const startDate = new Date(trip.start_date);
        const endDate = new Date(trip.end_date);
        const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
        const stats = computeTripStats(segments, totalDays);

        savedTrips.push({ trip, segments, stats });
      }

      if (savedTrips.length > 0) {
        // Auto-load the most recent non-draft trip, if any
        const mostRecentActive = [...savedTrips]
          .reverse()
          .find((t) => t.trip.status !== 'draft');
        if (mostRecentActive) {
          useTripStore.getState().loadTrip(mostRecentActive.trip, mostRecentActive.segments, mostRecentActive.stats);
          usePlaybackStore.getState().reinitialize();
          set({ trips: savedTrips, activeTripId: mostRecentActive.trip.id, loaded: true });
        } else {
          set({ trips: savedTrips, activeTripId: null, loaded: true });
        }
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },
}));

export default useTripsListStore;

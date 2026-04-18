import useTripStore, { type SegmentPatch, type TripPatch } from '@/stores/tripStore';
import type { Segment } from '@/types/segment';
import type { Trip } from '@/types/trip';

/**
 * Optimistically patch a segment in the local store, then persist to Supabase.
 * On failure, revert and surface the error message via console (UI banner TBD).
 */
export async function patchSegment(id: string, patch: SegmentPatch): Promise<void> {
  const before = useTripStore.getState().segments.find((s) => s.id === id);
  if (!before) return;

  useTripStore.getState().updateSegment(id, patch);

  try {
    const res = await fetch(`/api/segments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
      throw new Error(error || 'Save failed');
    }
  } catch (err) {
    // Revert
    useTripStore.getState().updateSegment(id, {
      title: before.title,
      details: before.details as Segment['details'],
    });
    console.error('[patchSegment] revert:', err);
    throw err;
  }
}

export async function patchTrip(id: string, patch: TripPatch): Promise<void> {
  const before = useTripStore.getState().trip;
  if (!before || before.id !== id) return;

  useTripStore.getState().updateTrip(patch);

  try {
    const res = await fetch(`/api/trips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
      throw new Error(error || 'Save failed');
    }
  } catch (err) {
    useTripStore.getState().updateTrip({
      title: before.title,
      description: before.description,
    } as Partial<Trip>);
    console.error('[patchTrip] revert:', err);
    throw err;
  }
}

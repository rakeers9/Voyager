import type { Trip } from '@/types/trip';

export interface DraftTripResult {
  id: string;
  trip: Trip;
}

export async function createDraftTrip(): Promise<DraftTripResult | null> {
  try {
    const res = await fetch('/api/trips/draft', { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id || !data?.trip) return null;
    return { id: data.id, trip: data.trip };
  } catch {
    return null;
  }
}

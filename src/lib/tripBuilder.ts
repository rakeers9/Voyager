import type { Segment, StopSegment, TransitSegment } from '@/types/segment';
import type { Trip, TripStats } from '@/types/trip';
import type { StopDef, TransitDef, SegmentDef } from '@/data/seedTrip';
import { fromZonedTime } from 'date-fns-tz';

const MIN = 60_000;

/**
 * Build full Segment[] from SegmentDef[] with cascading timestamps.
 */
export function buildSegmentsFromDefs(
  defs: SegmentDef[],
  tripId: string,
  tripStartMs: number
): Segment[] {
  let currentTime = tripStartMs;

  return defs.map((def, i) => {
    const startTime = currentTime;
    const endTime = startTime + def.duration * MIN;
    currentTime = endTime;

    // Real UUIDs so the client, DB, and PATCH endpoints all agree on segment
    // identity after save. Falls back to a random string only on environments
    // without crypto.randomUUID (should never happen in modern browsers/Node).
    const segmentId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`;

    const base = {
      id: segmentId,
      trip_id: tripId,
      sequence_order: i,
      title: def.title,
      startTime,
      endTime,
      duration_minutes: def.duration,
      details: (def.details ?? {}) as Segment['details'],
    };

    if (def.type === 'stop') {
      return {
        ...base,
        type: 'stop' as const,
        latitude: def.latitude,
        longitude: def.longitude,
        category: def.category,
      } satisfies StopSegment;
    }

    return {
      ...base,
      type: def.type as 'drive' | 'walk',
      latitude: def.destination[1],
      longitude: def.destination[0],
      origin_lat: def.origin[1],
      origin_lng: def.origin[0],
      destination_lat: def.destination[1],
      destination_lng: def.destination[0],
      routeCoordinates: def.route,
      distance_meters: def.distance_meters,
    } satisfies TransitSegment;
  });
}

/**
 * Compute aggregate stats from a Segment[].
 */
export function computeTripStats(segments: Segment[], totalDays: number): TripStats {
  return {
    totalSegments: segments.length,
    totalStops: segments.filter((s) => s.type === 'stop').length,
    totalDrives: segments.filter((s) => s.type === 'drive').length,
    totalWalks: segments.filter((s) => s.type === 'walk').length,
    totalDrivingDistance: segments
      .filter((s): s is TransitSegment => s.type === 'drive')
      .reduce((sum, s) => sum + s.distance_meters, 0),
    totalWalkingDistance: segments
      .filter((s): s is TransitSegment => s.type === 'walk')
      .reduce((sum, s) => sum + s.distance_meters, 0),
    totalDays,
    tripStartTime: segments[0]?.startTime ?? 0,
    tripEndTime: segments[segments.length - 1]?.endTime ?? 0,
  };
}

/**
 * Haversine distance in meters between two [lng, lat] points.
 */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate driving duration in minutes from distance in meters.
 * Assumes ~50 mph average (highway + local mix).
 */
function estimateDriveDuration(distanceMeters: number): number {
  const avgSpeedMps = 22.35; // ~50 mph
  return Math.max(5, Math.round(distanceMeters / avgSpeedMps / 60));
}

/** Validate "HH:MM" 24-hour string from the model; fall back to 08:00. */
function normalizeStartTime(raw: string | undefined): string {
  if (!raw) return '08:00';
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return '08:00';
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * A stop as produced by the LLM chatbot.
 */
export interface PlannedStop {
  name: string;
  place_query: string;
  category: 'meal' | 'accommodation' | 'activity' | 'sightseeing' | 'transit_hub' | 'errand' | 'rest';
  duration_minutes: number;
  description?: string;
  transit_type?: 'drive' | 'walk';
  transit_duration_estimate?: number;
  details?: Record<string, unknown>;
}

export interface TripPlanData {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  timezone: string;
  /**
   * Local clock time the trip begins on day 1, "HH:MM" 24-hour.
   * Defaults to "08:00" when missing (older plans built before this field).
   */
  start_time_local?: string;
  stops: PlannedStop[];
}

export interface GeocodedStop extends PlannedStop {
  lat: number;
  lng: number;
}

interface RoutedLeg {
  coordinates: [number, number][];
  distance_meters: number;
  duration_seconds: number;
}

/**
 * Fetch a road-following route between two points via the Mapbox Directions
 * API (proxied through /api/directions). Returns null on failure so the
 * caller can fall back to a straight line.
 */
async function fetchRoute(
  from: [number, number],
  to: [number, number],
  profile: 'driving' | 'walking'
): Promise<RoutedLeg | null> {
  try {
    const res = await fetch(
      `/api/directions?from=${from.join(',')}&to=${to.join(',')}&profile=${profile}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.coordinates) || data.coordinates.length < 2) return null;
    return {
      coordinates: data.coordinates as [number, number][],
      distance_meters: Number(data.distance_meters) || 0,
      duration_seconds: Number(data.duration_seconds) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Build a complete trip from geocoded stops.
 * Generates transit segments between consecutive stops automatically,
 * fetching real road-following routes from Mapbox Directions.
 */
export async function buildTripFromGeocodedStops(
  plan: TripPlanData,
  geocodedStops: GeocodedStop[]
): Promise<{ trip: Trip; segments: Segment[]; stats: TripStats }> {
  const tripId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const startTime = normalizeStartTime(plan.start_time_local);
  const tripStartMs = fromZonedTime(`${plan.start_date}T${startTime}:00`, plan.timezone).getTime();

  // Pre-compute routed legs in parallel, batched to be polite to the API.
  type Leg = { from: [number, number]; to: [number, number]; profile: 'driving' | 'walking' };
  const legs: Leg[] = [];
  for (let i = 1; i < geocodedStops.length; i++) {
    const prev = geocodedStops[i - 1];
    const cur = geocodedStops[i];
    const profile = (cur.transit_type ?? 'drive') === 'walk' ? 'walking' : 'driving';
    legs.push({
      from: [prev.lng, prev.lat],
      to: [cur.lng, cur.lat],
      profile,
    });
  }

  const routed: (RoutedLeg | null)[] = new Array(legs.length).fill(null);
  const BATCH = 4;
  for (let i = 0; i < legs.length; i += BATCH) {
    const batch = legs.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((leg) => fetchRoute(leg.from, leg.to, leg.profile))
    );
    results.forEach((r, j) => {
      routed[i + j] = r;
    });
  }

  // Build SegmentDef[] — interleave stops with transit segments
  const defs: SegmentDef[] = [];

  for (let i = 0; i < geocodedStops.length; i++) {
    const stop = geocodedStops[i];

    // Generate transit segment from previous stop (if not first)
    if (i > 0) {
      const prev = geocodedStops[i - 1];
      const transitType = stop.transit_type ?? 'drive';
      const leg = routed[i - 1];

      // Prefer the routed leg; fall back to a straight line + haversine.
      const route = leg?.coordinates ?? ([
        [prev.lng, prev.lat],
        [stop.lng, stop.lat],
      ] as [number, number][]);
      const dist = leg
        ? leg.distance_meters
        : Math.round(haversineMeters(prev.lat, prev.lng, stop.lat, stop.lng));
      const mapboxMinutes = leg ? Math.max(1, Math.round(leg.duration_seconds / 60)) : null;
      const plannerMinutes = stop.transit_duration_estimate;

      // Prefer the planner's estimate, but fall back to Mapbox if the
      // two disagree wildly (>50% AND >15 min off). Catches cases where
      // the chatbot wildly underestimated a long drive.
      let transitDuration: number;
      if (plannerMinutes == null) {
        transitDuration = mapboxMinutes ?? estimateDriveDuration(dist);
      } else if (mapboxMinutes != null) {
        const diff = Math.abs(plannerMinutes - mapboxMinutes);
        const relTolerance = Math.max(15, mapboxMinutes * 0.5);
        transitDuration = diff > relTolerance ? mapboxMinutes : plannerMinutes;
        if (diff > relTolerance) {
          console.warn(
            `[tripBuilder] Overriding planner duration ${plannerMinutes}m → ${mapboxMinutes}m for ${prev.name} → ${stop.name}`
          );
        }
      } else {
        transitDuration = plannerMinutes;
      }

      defs.push({
        type: transitType,
        title: `${prev.name} → ${stop.name}`,
        duration: transitDuration,
        origin: [prev.lng, prev.lat] as [number, number],
        destination: [stop.lng, stop.lat] as [number, number],
        route,
        distance_meters: dist,
      } satisfies TransitDef);
    }

    // Add the stop
    defs.push({
      type: 'stop',
      title: stop.name,
      latitude: stop.lat,
      longitude: stop.lng,
      category: stop.category,
      duration: stop.duration_minutes,
      details: {
        description: stop.description,
        photo_query: stop.place_query,
        ...(stop.details ?? {}),
      },
    } satisfies StopDef);
  }

  const segments = buildSegmentsFromDefs(defs, tripId, tripStartMs);

  // Calculate total days from date range
  const startDate = new Date(plan.start_date);
  const endDate = new Date(plan.end_date);
  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);

  const stats = computeTripStats(segments, totalDays);

  const trip: Trip = {
    id: tripId,
    title: plan.title,
    description: plan.description,
    start_date: plan.start_date,
    end_date: plan.end_date,
    timezone: plan.timezone,
    status: 'active',
  };

  return { trip, segments, stats };
}

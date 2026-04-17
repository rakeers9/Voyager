import type { Segment, StopSegment, TransitSegment, StopCategory } from '@/types/segment';
import type { Trip, TripStats } from '@/types/trip';
import generatedRoutes from './generatedRoutes.json';

/**
 * Stable key for a transit segment's fetched Directions data.
 * Must match the key format used by `scripts/fetchRoutes.ts`.
 */
function routeKey(type: 'drive' | 'walk', origin: [number, number], destination: [number, number]): string {
  return `${type}:${origin[0]},${origin[1]}->${destination[0]},${destination[1]}`;
}

type GeneratedRoute = {
  duration_minutes: number;
  distance_meters: number;
  route: [number, number][];
};
const routesMap = generatedRoutes as unknown as Record<string, GeneratedRoute>;

/**
 * Seed data: Yosemite Road Trip — Jun 11–13, 2026
 * 26 segments across 3 days, showcasing all segment types and categories.
 */

import { fromZonedTime } from 'date-fns-tz';

const TRIP_TIMEZONE = 'America/Los_Angeles';
// 8:00 AM Pacific on June 11, 2026 — stored as UTC
const TRIP_START = fromZonedTime('2026-06-11T08:00:00', TRIP_TIMEZONE).getTime();
const MIN = 60_000;

export interface StopDef {
  type: 'stop';
  title: string;
  latitude: number;
  longitude: number;
  category: StopCategory;
  duration: number;
  details?: Record<string, unknown>;
}

export interface TransitDef {
  type: 'drive' | 'walk';
  title: string;
  duration: number;
  origin: [number, number];
  destination: [number, number];
  route: [number, number][];
  distance_meters: number;
  details?: Record<string, unknown>;
}

export type SegmentDef = StopDef | TransitDef;

export const segmentDefs: SegmentDef[] = [
  // ── Day 1: Thursday, June 11 ──────────────────────────
  {
    type: 'stop',
    title: 'Home — San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
    category: 'rest',
    duration: 30,
    details: {
      notes: 'Load the car, final checks',
    },
  },
  {
    type: 'drive',
    title: 'SF → In-N-Out Tracy',
    duration: 90,
    origin: [-122.4194, 37.7749],
    destination: [-121.4380, 37.7350],
    route: [[-122.4194, 37.7749], [-122.2708, 37.8044], [-121.9358, 37.7016], [-121.4380, 37.7350]],
    distance_meters: 100_000,
  },
  {
    type: 'stop',
    title: 'In-N-Out Burger — Tracy',
    latitude: 37.7350,
    longitude: -121.4380,
    category: 'meal',
    duration: 45,
    details: {
      description: 'Classic road trip fuel stop.',
      cuisine: 'American / Fast Food',
      photo_query: 'In-N-Out Burger 3150 Naglee Rd Tracy CA',
    },
  },
  {
    type: 'drive',
    title: 'Tracy → Yosemite Valley',
    duration: 150,
    origin: [-121.4380, 37.7350],
    destination: [-119.5885, 37.7490],
    route: [
      [-121.4380, 37.7350], [-121.2161, 37.7975], [-120.8472, 37.7667],
      [-120.2314, 37.8462], [-119.8831, 37.7423], [-119.5885, 37.7490],
    ],
    distance_meters: 200_000,
  },
  {
    type: 'stop',
    title: 'Yosemite Valley Welcome Center',
    latitude: 37.7472,
    longitude: -119.5886,
    category: 'sightseeing',
    duration: 60,
    details: {
      description: 'Get oriented. Maps, exhibits, and ranger info for the valley.',
      photo_query: 'Yosemite Valley Welcome Center',
    },
  },
  {
    type: 'stop',
    title: 'Lower Yosemite Fall Trail',
    latitude: 37.7562,
    longitude: -119.5963,
    category: 'activity',
    duration: 30,
    details: {
      description: 'Short paved loop from the Visitor Center shuttle stop to the base of the falls.',
      trail_difficulty: 'Easy',
      notes: 'Hiking trail — duration is estimated, not routed.',
    },
  },
  {
    type: 'stop',
    title: 'Lower Yosemite Fall',
    latitude: 37.7562,
    longitude: -119.5963,
    category: 'activity',
    duration: 90,
    details: {
      description: 'Short loop trail to the base of Yosemite Falls. Misty and spectacular.',
      trail_difficulty: 'Easy',
      photo_query: 'Lower Yosemite Fall Yosemite National Park',
    },
  },
  {
    type: 'stop',
    title: 'Valley Loop Walk to Curry Village',
    latitude: 37.7387,
    longitude: -119.5714,
    category: 'activity',
    duration: 20,
    details: {
      description: 'Short valley-floor walk from Lower Yosemite Fall area across to Curry Village.',
      trail_difficulty: 'Easy',
      notes: 'On-foot segment — duration is estimated, not routed.',
    },
  },
  {
    type: 'stop',
    title: 'Curry Village Pizza Deck',
    latitude: 37.7387,
    longitude: -119.5714,
    category: 'meal',
    duration: 60,
    details: {
      description: 'Outdoor pizza deck in Curry Village. Busy but good.',
      cuisine: 'Pizza',
      photo_query: 'Curry Village Pizza Deck Yosemite',
    },
  },
  {
    type: 'drive',
    title: 'Curry Village → Cabin',
    duration: 30,
    origin: [-119.5714, 37.7387],
    destination: [-119.8831, 37.6893],
    route: [[-119.5714, 37.7387], [-119.6200, 37.7200], [-119.7500, 37.7000], [-119.8831, 37.6893]],
    distance_meters: 40_000,
  },
  {
    type: 'stop',
    title: 'Cabin — Foresta',
    latitude: 37.6893,
    longitude: -119.8831,
    category: 'accommodation',
    duration: 720,
    details: {
      description: 'Private cabin in the Foresta area. Quiet, secluded, great for stargazing.',
      notes: 'Firewood under the deck.',
    },
  },

  // ── Day 2: Friday, June 12 ──────────────────────────
  {
    type: 'stop',
    title: 'Cabin — Breakfast',
    latitude: 37.6893,
    longitude: -119.8831,
    category: 'rest',
    duration: 60,
    details: { notes: 'Coffee, eggs, pack daypacks' },
  },
  {
    type: 'drive',
    title: 'Cabin → Glacier Point',
    duration: 45,
    origin: [-119.8831, 37.6893],
    destination: [-119.5728, 37.7306],
    route: [[-119.8831, 37.6893], [-119.7500, 37.7000], [-119.6774, 37.7158], [-119.5728, 37.7306]],
    distance_meters: 50_000,
  },
  {
    type: 'stop',
    title: 'Glacier Point',
    latitude: 37.7306,
    longitude: -119.5728,
    category: 'sightseeing',
    duration: 90,
    details: {
      description: 'Panoramic view of Yosemite Valley, Half Dome, and the High Sierra.',
      photo_query: 'Glacier Point Yosemite National Park',
    },
  },
  {
    type: 'stop',
    title: 'Glacier Point Overlook Trail',
    latitude: 37.7285,
    longitude: -119.5740,
    category: 'activity',
    duration: 45,
    details: {
      description: 'Short loop along the Glacier Point rim for alternate viewpoints.',
      trail_difficulty: 'Moderate',
      notes: 'Hiking trail — duration is estimated, not routed.',
    },
  },
  {
    type: 'drive',
    title: 'Glacier Point → Tunnel View',
    duration: 25,
    origin: [-119.5728, 37.7306],
    destination: [-119.6774, 37.7158],
    route: [[-119.5728, 37.7306], [-119.6200, 37.7200], [-119.6774, 37.7158]],
    distance_meters: 20_000,
  },
  {
    type: 'stop',
    title: 'Tunnel View',
    latitude: 37.7158,
    longitude: -119.6774,
    category: 'sightseeing',
    duration: 30,
    details: {
      description: 'The iconic Yosemite Valley vista. El Capitan on the left, Bridalveil Fall on the right, Half Dome centered.',
      photo_query: 'Tunnel View Yosemite National Park',
    },
  },
  {
    type: 'drive',
    title: 'Tunnel View → Mariposa Grove',
    duration: 45,
    origin: [-119.6774, 37.7158],
    destination: [-119.6011, 37.5142],
    route: [[-119.6774, 37.7158], [-119.6500, 37.6500], [-119.6200, 37.5800], [-119.6011, 37.5142]],
    distance_meters: 55_000,
  },
  {
    type: 'stop',
    title: 'Mariposa Grove of Giant Sequoias',
    latitude: 37.5142,
    longitude: -119.6011,
    category: 'activity',
    duration: 120,
    details: {
      description: 'Home to over 500 mature giant sequoias, including the Grizzly Giant (~1,900 years old).',
      trail_difficulty: 'Moderate',
      photo_query: 'Mariposa Grove of Giant Sequoias Yosemite',
    },
  },
  {
    type: 'drive',
    title: 'Mariposa Grove → Cabin',
    duration: 60,
    origin: [-119.6011, 37.5142],
    destination: [-119.8831, 37.6893],
    route: [[-119.6011, 37.5142], [-119.6200, 37.5800], [-119.6774, 37.6500], [-119.7500, 37.7000], [-119.8831, 37.6893]],
    distance_meters: 60_000,
  },
  {
    type: 'stop',
    title: 'Cabin — Foresta',
    latitude: 37.6893,
    longitude: -119.8831,
    category: 'accommodation',
    duration: 915,
    details: {
      description: 'Second night at the cabin.',
      notes: 'Grill burgers for dinner. Watch the sunset.',
    },
  },

  // ── Day 3: Saturday, June 13 ──────────────────────────
  {
    type: 'stop',
    title: 'Cabin — Morning',
    latitude: 37.6893,
    longitude: -119.8831,
    category: 'rest',
    duration: 90,
    details: { notes: 'Pack up, clean cabin, load car' },
  },
  {
    type: 'drive',
    title: 'Cabin → In-N-Out Oakdale',
    duration: 120,
    origin: [-119.8831, 37.6893],
    destination: [-120.8472, 37.7667],
    route: [[-119.8831, 37.6893], [-120.2314, 37.8462], [-120.5500, 37.8000], [-120.8472, 37.7667]],
    distance_meters: 150_000,
  },
  {
    type: 'stop',
    title: 'In-N-Out Burger — Oakdale',
    latitude: 37.7667,
    longitude: -120.8472,
    category: 'meal',
    duration: 45,
    details: {
      description: 'Bookend the trip with In-N-Out.',
      cuisine: 'American / Fast Food',
      photo_query: 'In-N-Out Burger 877 E F St Oakdale CA',
    },
  },
  {
    type: 'drive',
    title: 'Oakdale → San Francisco',
    duration: 90,
    origin: [-120.8472, 37.7667],
    destination: [-122.4194, 37.7749],
    route: [
      [-120.8472, 37.7667], [-121.2161, 37.7975], [-121.4380, 37.7350],
      [-121.9358, 37.7016], [-122.2708, 37.8044], [-122.4194, 37.7749],
    ],
    distance_meters: 140_000,
  },
  {
    type: 'stop',
    title: 'Home — San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
    category: 'rest',
    duration: 1,
    details: { notes: 'Arrival. Trip complete.' },
  },
];

// Build segments with cascading timestamps.
// Transit segments prefer fetched Directions data (run `npm run fetch-routes`)
// and fall back to the hand-authored route/duration/distance values.
let currentTime = TRIP_START;
const segments: Segment[] = segmentDefs.map((def, i) => {
  const isTransit = def.type === 'drive' || def.type === 'walk';
  const fetched = isTransit
    ? routesMap[routeKey(def.type, (def as TransitDef).origin, (def as TransitDef).destination)]
    : undefined;
  const duration = fetched?.duration_minutes ?? def.duration;

  const startTime = currentTime;
  const endTime = startTime + duration * MIN;
  currentTime = endTime;

  const base = {
    id: `seg-${String(i).padStart(2, '0')}`,
    trip_id: 'trip-yosemite-2026',
    sequence_order: i,
    title: def.title,
    startTime,
    endTime,
    duration_minutes: duration,
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
    routeCoordinates: fetched?.route ?? def.route,
    distance_meters: fetched?.distance_meters ?? def.distance_meters,
  } satisfies TransitSegment;
});

export const seedTrip: Trip = {
  id: 'trip-yosemite-2026',
  title: 'Yosemite Road Trip',
  description: 'Three days exploring Yosemite National Park. San Francisco → Yosemite Valley → Glacier Point → Mariposa Grove → Home.',
  start_date: '2026-06-11',
  end_date: '2026-06-13',
  timezone: TRIP_TIMEZONE,
  status: 'active',
};

export const seedSegments: Segment[] = segments;

export const tripStats: TripStats = {
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
  totalDays: 3,
  tripStartTime: segments[0].startTime,
  tripEndTime: segments[segments.length - 1].endTime,
};

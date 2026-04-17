export type SegmentType = 'drive' | 'stop' | 'walk';

export type StopCategory =
  | 'meal'
  | 'accommodation'
  | 'activity'
  | 'sightseeing'
  | 'transit_hub'
  | 'errand'
  | 'rest';

export interface SegmentDetails {
  description?: string;
  photos?: string[];
  photo_query?: string;  // Google Places search query for fetching a photo
  rating?: number;
  price_level?: number;
  address?: string;
  phone?: string;
  website?: string;
  hours?: string;
  confirmation_number?: string;
  cuisine?: string;
  trail_difficulty?: string;
  notes?: string;
  cost_cents?: number;
  tags?: string[];
}

interface SegmentBase {
  id: string;
  trip_id: string;
  sequence_order: number;
  type: SegmentType;
  title: string;
  startTime: number; // unix ms
  endTime: number;   // unix ms
  duration_minutes: number;
  latitude: number;
  longitude: number;
  details: SegmentDetails;
}

export interface StopSegment extends SegmentBase {
  type: 'stop';
  category: StopCategory;
}

export interface TransitSegment extends SegmentBase {
  type: 'drive' | 'walk';
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  routeCoordinates: [number, number][]; // [lng, lat][]
  distance_meters: number;
}

export type Segment = StopSegment | TransitSegment;

export function isStopSegment(seg: Segment): seg is StopSegment {
  return seg.type === 'stop';
}

export function isTransitSegment(seg: Segment): seg is TransitSegment {
  return seg.type === 'drive' || seg.type === 'walk';
}

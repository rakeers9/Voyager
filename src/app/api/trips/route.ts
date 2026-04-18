import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/trips — list all trips for the current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: trips, error } = await supabase
    .from('trips')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(trips);
}

// POST /api/trips — save a complete trip (trip + segments)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { trip, segments } = await request.json();

  // Upsert the trip
  const { data: savedTrip, error: tripError } = await supabase
    .from('trips')
    .upsert({
      id: trip.id,
      owner_id: user.id,
      title: trip.title,
      description: trip.description || '',
      start_date: trip.start_date,
      end_date: trip.end_date,
      timezone: trip.timezone,
      status: trip.status || 'active',
    })
    .select()
    .single();

  if (tripError) {
    return Response.json({ error: tripError.message }, { status: 500 });
  }

  // Delete existing segments for this trip, then insert new ones
  await supabase.from('segments').delete().eq('trip_id', savedTrip.id);

  const segmentRows = segments.map((seg: Record<string, unknown>) => ({
    trip_id: savedTrip.id,
    sequence_order: seg.sequence_order,
    type: seg.type,
    start_time: new Date(seg.startTime as number).toISOString(),
    end_time: new Date(seg.endTime as number).toISOString(),
    duration_minutes: seg.duration_minutes,
    title: seg.title,
    latitude: seg.latitude,
    longitude: seg.longitude,
    origin_lat: seg.origin_lat || null,
    origin_lng: seg.origin_lng || null,
    destination_lat: seg.destination_lat || null,
    destination_lng: seg.destination_lng || null,
    route_coordinates: seg.routeCoordinates || null,
    distance_meters: seg.distance_meters || null,
    category: seg.category || null,
    details: seg.details || {},
  }));

  const { error: segError } = await supabase
    .from('segments')
    .insert(segmentRows);

  if (segError) {
    return Response.json({ error: segError.message }, { status: 500 });
  }

  return Response.json({ id: savedTrip.id, saved: true });
}

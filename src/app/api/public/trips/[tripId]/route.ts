import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Public (no-auth) trip read endpoint used by /share/[tripId].
// Uses the service-role key to bypass RLS so anyone with the trip UUID can view.
// Only returns trips with status='active' — drafts and archived trips are not shareable.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, title, description, start_date, end_date, timezone, status')
    .eq('id', tripId)
    .single();

  if (tripError || !trip) {
    return Response.json({ error: 'Trip not found' }, { status: 404 });
  }

  if (trip.status !== 'active') {
    return Response.json({ error: 'Trip not available' }, { status: 404 });
  }

  const { data: segments, error: segError } = await supabase
    .from('segments')
    .select('*')
    .eq('trip_id', tripId)
    .order('sequence_order');

  if (segError) {
    return Response.json({ error: segError.message }, { status: 500 });
  }

  const formattedSegments = (segments || []).map((row) => {
    const base = {
      id: row.id,
      trip_id: row.trip_id,
      sequence_order: row.sequence_order,
      type: row.type,
      title: row.title,
      startTime: new Date(row.start_time).getTime(),
      endTime: new Date(row.end_time).getTime(),
      duration_minutes: row.duration_minutes,
      latitude: row.latitude,
      longitude: row.longitude,
      details: row.details || {},
    };

    if (row.type === 'stop') {
      return { ...base, category: row.category };
    }

    return {
      ...base,
      origin_lat: row.origin_lat,
      origin_lng: row.origin_lng,
      destination_lat: row.destination_lat,
      destination_lng: row.destination_lng,
      routeCoordinates: row.route_coordinates || [],
      distance_meters: row.distance_meters || 0,
    };
  });

  return Response.json({ trip, segments: formattedSegments });
}

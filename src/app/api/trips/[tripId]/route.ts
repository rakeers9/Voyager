import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/trips/[tripId] — load a single trip with all segments
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (tripError || !trip) {
    return Response.json({ error: 'Trip not found' }, { status: 404 });
  }

  const { data: segments, error: segError } = await supabase
    .from('segments')
    .select('*')
    .eq('trip_id', tripId)
    .order('sequence_order');

  if (segError) {
    return Response.json({ error: segError.message }, { status: 500 });
  }

  // Convert DB rows to the format our stores expect
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

  return Response.json({
    trip: {
      id: trip.id,
      title: trip.title,
      description: trip.description,
      start_date: trip.start_date,
      end_date: trip.end_date,
      timezone: trip.timezone,
      status: trip.status,
    },
    segments: formattedSegments,
  });
}

// PATCH /api/trips/[tripId] — partial update (currently: title)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.title === 'string' && body.title.trim().length > 0) {
    patch.title = body.title.trim();
  }
  if (typeof body?.description === 'string') {
    patch.description = body.description;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('trips')
    .update(patch)
    .eq('id', tripId)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ trip: data });
}

// DELETE /api/trips/[tripId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase.from('trips').delete().eq('id', tripId);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ deleted: true });
}

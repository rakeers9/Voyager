import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/segments/[segmentId] — update editable fields on a segment.
// Allowed: title (top-level), details (JSONB merge of editable keys).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ segmentId: string }> }
) {
  const { segmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    details?: Record<string, unknown>;
  };

  // Whitelist editable detail keys (phase 1: text fields only)
  const ALLOWED_DETAIL_KEYS = new Set([
    'description',
    'notes',
    'cuisine',
    'trail_difficulty',
    'confirmation_number',
    'address',
    'phone',
    'website',
    'cost_cents',
    'tags',
  ]);

  // Load existing row to merge details JSONB
  const { data: existing, error: loadErr } = await supabase
    .from('segments')
    .select('id, details, trip_id')
    .eq('id', segmentId)
    .single();

  if (loadErr || !existing) {
    return Response.json({ error: 'Segment not found' }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.title === 'string' && body.title.trim()) {
    update.title = body.title.trim();
  }

  if (body.details && typeof body.details === 'object') {
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.details)) {
      if (!ALLOWED_DETAIL_KEYS.has(k)) continue;
      // Treat empty string as deletion
      if (v === '' || v === null || v === undefined) {
        filtered[k] = null;
      } else {
        filtered[k] = v;
      }
    }
    const currentDetails = (existing.details as Record<string, unknown>) || {};
    const mergedDetails = { ...currentDetails, ...filtered };
    // Strip null values so JSONB stays clean
    for (const k of Object.keys(mergedDetails)) {
      if (mergedDetails[k] === null) delete mergedDetails[k];
    }
    update.details = mergedDetails;
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ ok: true, noop: true });
  }

  const { error: updErr } = await supabase
    .from('segments')
    .update(update)
    .eq('id', segmentId);

  if (updErr) {
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  // Bump trip's updated_at so list ordering reflects edits
  await supabase
    .from('trips')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', existing.trip_id);

  return Response.json({ ok: true });
}

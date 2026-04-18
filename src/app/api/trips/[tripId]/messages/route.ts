import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/trips/[tripId]/messages — list chat messages for a trip
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('trip_id', tripId)
    .order('sequence_order', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

// POST /api/trips/[tripId]/messages — append one or more messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    function_call?: string;
    function_call_args?: unknown;
    trip_plan?: unknown;
  }> = Array.isArray(body.messages) ? body.messages : [body];

  // Find current max sequence_order
  const { data: last } = await supabase
    .from('chat_messages')
    .select('sequence_order')
    .eq('trip_id', tripId)
    .order('sequence_order', { ascending: false })
    .limit(1);

  let nextOrder = (last?.[0]?.sequence_order ?? -1) + 1;
  const rows = messages.map((m) => ({
    trip_id: tripId,
    role: m.role,
    content: m.content,
    function_call: m.function_call ?? null,
    function_call_args: m.function_call_args ?? null,
    trip_plan: m.trip_plan ?? null,
    sequence_order: nextOrder++,
  }));

  const { error } = await supabase.from('chat_messages').insert(rows);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ saved: true });
}

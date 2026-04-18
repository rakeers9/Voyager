import { createClient } from '@/lib/supabase/server';

// POST /api/trips/draft — create an empty draft trip and return it.
// Auto-numbers the title as "Untitled Trip N" so multiple drafts are distinguishable
// in the sidebar dropdown even before the user (or the model) gives it a real name.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Find existing "Untitled Trip N" titles for this user and compute next N.
  const { data: existing } = await supabase
    .from('trips')
    .select('title')
    .eq('owner_id', user.id)
    .ilike('title', 'Untitled Trip%');

  let nextNumber = 1;
  if (existing && existing.length > 0) {
    const used = new Set<number>();
    for (const row of existing) {
      const m = /^Untitled Trip\s+(\d+)$/i.exec(row.title ?? '');
      if (m) used.add(parseInt(m[1], 10));
    }
    while (used.has(nextNumber)) nextNumber++;
  }

  const title = `Untitled Trip ${nextNumber}`;

  const { data, error } = await supabase
    .from('trips')
    .insert({
      owner_id: user.id,
      title,
      description: '',
      start_date: today,
      end_date: today,
      timezone: 'America/Los_Angeles',
      status: 'draft',
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: data.id, trip: data });
}

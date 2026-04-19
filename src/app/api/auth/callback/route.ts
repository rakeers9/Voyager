import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  // Supabase appends type=recovery to the magic link for password resets.
  // When present, route the user to /reset-password instead of the dashboard
  // so they can actually set a new password.
  const type = searchParams.get('type');
  const explicitNext = searchParams.get('next');
  const next =
    explicitNext ??
    (type === 'recovery' ? '/reset-password' : '/');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

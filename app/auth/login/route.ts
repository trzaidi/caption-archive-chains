import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { CANONICAL_ORIGIN } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// OAuth starts and finishes on one stable origin so the PKCE cookie survives the round trip.
// Local development uses its own origin.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const origin = local ? url.origin : CANONICAL_ORIGIN;
  if (url.origin !== origin) return NextResponse.redirect(new URL('/auth/login', origin));
  const client = await db();
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/auth/callback`, queryParams: { prompt: 'select_account' } } });
  if (error || !data.url) return NextResponse.redirect(new URL('/login?error=oauth', origin));
  const response = NextResponse.redirect(data.url);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

import { redirect } from 'next/navigation';
import { db } from './supabase';

export const CANONICAL_ORIGIN = 'https://caption-archive-chains.vercel.app';

async function currentAdmin() {
  const supabase = await db();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.is_anonymous || user.app_metadata?.provider !== 'google') return { supabase, status: 'anonymous' as const };
  const { data, error: profileError } = await supabase.from('profiles').select('id,is_superadmin,first_name,last_name').eq('id', user.id).single();
  if (profileError || data?.is_superadmin !== true) return { supabase, status: 'denied' as const, user };
  return { supabase, status: 'admin' as const, user, profile: data };
}

/** Pages and server actions: redirect anyone who is not a Google-authenticated superadmin. */
export async function requireAdmin() {
  const result = await currentAdmin();
  if (result.status === 'anonymous') redirect('/login');
  if (result.status === 'denied') redirect('/denied');
  return result;
}

/** Route handlers: same check, but answered with a status code instead of a redirect. */
export async function adminOrResponse() {
  const result = await currentAdmin();
  if (result.status !== 'admin') return { response: Response.json({ error: 'Administrator access required.' }, { status: result.status === 'anonymous' ? 401 : 403 }) };
  return result;
}

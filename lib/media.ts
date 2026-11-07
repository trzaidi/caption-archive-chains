import type { SupabaseClient } from '@supabase/supabase-js';

export const MEDIA_BUCKET = 'chain-media';
export const SIGNED_URL_SECONDS = 60 * 60;

/** Private bucket: every image is served through a short-lived signed URL made for the admin. */
export async function signedUrls(supabase: SupabaseClient, paths: Array<string | null | undefined>) {
  const unique = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  for (const entry of data ?? []) if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  return map;
}

export async function signedUrl(supabase: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

export const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

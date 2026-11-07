import type { SupabaseClient } from '@supabase/supabase-js';

// Pictures for rating-app captions are bundled with the public app.
export const RATING_APP_ORIGIN = 'https://design-gen-ai-phi.vercel.app';

export type ChainCaption = {
  id: number; created_at: string; model: string; status: string; latency_ms: number | null;
  captions: { id: number; caption_text: string; image_path: string | null; image_description: string; tone: string | null; created_at: string } | null;
};

/** Captions the rating app published through a chain, from the Week 7 response log. */
export async function loadChainCaptions(supabase: SupabaseClient, chainId: number, limit = 48) {
  const { data, count } = await supabase.from('llm_responses')
    .select('id,created_at,model,status,latency_ms,captions(id,caption_text,image_path,image_description,tone,created_at)', { count: 'exact' })
    .eq('prompt_chain_id', chainId).not('caption_id', 'is', null).order('created_at', { ascending: false }).limit(limit)
    .returns<ChainCaption[]>();
  return { captions: (data ?? []).filter((r) => r.captions), count: count ?? 0 };
}

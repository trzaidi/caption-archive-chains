import { adminOrResponse } from '@/lib/admin';
import { loadModels } from '@/lib/models';
import type { Chain, Step } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Downloads a chain and its steps as portable JSON (importable from the New chain page). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOrResponse();
  if ('response' in admin) return admin.response;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid chain.' }, { status: 400 });
  const [{ data: chain }, { data: steps }, models] = await Promise.all([
    admin.supabase.from('prompt_chains').select('*').eq('id', id).maybeSingle<Chain>(),
    admin.supabase.from('prompt_chain_steps').select('*').eq('prompt_chain_id', id).order('step_order').returns<Step[]>(),
    loadModels(admin.supabase),
  ]);
  if (!chain) return Response.json({ error: 'Chain not found.' }, { status: 404 });
  const body = {
    format: 'caption-archive-chain/v1',
    exported_at: new Date().toISOString(),
    name: chain.name, description: chain.description, input_type: chain.input_type,
    steps: (steps ?? []).map((s) => ({
      title: s.title, instructions: s.instructions, output_type: s.output_type, attach_input_image: s.attach_input_image,
      model: models.find((m) => m.id === s.llm_model_id)?.model_identifier ?? null,
    })),
  };
  const slug = chain.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chain';
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${slug}.chain.json"`, 'Cache-Control': 'no-store' },
  });
}

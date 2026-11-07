import { adminOrResponse } from '@/lib/admin';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/media';
import { executeChain, RUNS_PER_HOUR } from '@/lib/runner';
import { loadModels } from '@/lib/models';
import type { Chain, RunEvent, Step } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOrResponse();
  if ('response' in admin) return admin.response;
  const { supabase, user } = admin;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return fail('Invalid chain.', 400);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from('prompt_chain_runs').select('id', { count: 'exact', head: true }).eq('started_by', user.id).gte('created_at', since);
  if ((count ?? 0) >= RUNS_PER_HOUR) return fail(`Limit reached: ${RUNS_PER_HOUR} runs per hour per administrator. Try again later.`, 429);

  const [{ data: chain }, { data: steps }, models] = await Promise.all([
    supabase.from('prompt_chains').select('*').eq('id', id).maybeSingle<Chain>(),
    supabase.from('prompt_chain_steps').select('*').eq('prompt_chain_id', id).order('step_order').returns<Step[]>(),
    loadModels(supabase),
  ]);
  if (!chain) return fail('Chain not found.', 404);
  if (!steps?.length) return fail('Add at least one step before running this chain.', 400);

  let form: FormData;
  try { form = await request.formData(); } catch { return fail('Send the run input as form data.', 400); }
  const text = String(form.get('input_text') ?? '').trim();
  if (text.length > 8000) return fail('Input text must be at most 8,000 characters.', 400);
  const file = form.get('input_image');
  let image: { bytes: Uint8Array; mediaType: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES[file.type]) return fail('Upload a PNG, JPEG, WebP or GIF image.', 400);
    if (file.size > MAX_IMAGE_BYTES) return fail('Images must be 4 MB or smaller.', 400);
    image = { bytes: new Uint8Array(await file.arrayBuffer()), mediaType: file.type };
  }
  if (chain.input_type === 'image' && !image) return fail('This chain starts from an image. Upload one to run it.', 400);
  if (chain.input_type === 'text' && !text) return fail('This chain starts from text. Enter some input to run it.', 400);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      try {
        await executeChain({ supabase, userId: user.id, chain, steps, models, input: { text, image }, emit });
      } catch (e) {
        emit({ type: 'done', runId: 0, status: 'failed', error: e instanceof Error ? e.message : 'The run could not start.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}

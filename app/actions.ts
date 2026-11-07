'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { requireAdmin, CANONICAL_ORIGIN } from '@/lib/admin';
import { loadModels } from '@/lib/models';
import { remapReferences, validateTemplate } from '@/lib/template';
import { MEDIA_BUCKET } from '@/lib/media';
import { MAX_STEPS } from '@/lib/runner';
import { TONES, type InputType, type Model, type OutputType, type Tone } from '@/lib/types';

export type ActionState = { error: string; ok?: string };
type Client = Awaited<ReturnType<typeof db>>;
const field = (f: FormData, key: string) => String(f.get(key) ?? '').trim();
const idOf = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const INPUT_TYPES: InputType[] = ['image', 'text', 'none'];
const isUnique = (error: { code?: string } | null) => error?.code === '23505';

export async function login() { redirect(`${CANONICAL_ORIGIN}/auth/login`); }
export async function logout() { const client = await db(); await client.auth.signOut(); redirect('/login'); }

type StepDraft = { title: string; instructions: string; output_type: OutputType; llm_model_id: number | null; attach_input_image: boolean };

function checkStep(step: StepDraft, position: number, models: Model[]) {
  if (!step.title || step.title.length > 120) return 'Give the step a name of at most 120 characters.';
  if (!step.instructions || step.instructions.length > 8000) return 'Write a prompt of 1 to 8,000 characters.';
  if (step.output_type !== 'text' && step.output_type !== 'image') return 'Choose text or image output.';
  if (step.llm_model_id == null) {
    if (step.output_type === 'image') return 'Image steps need an image model.';
  } else {
    const model = models.find((m) => m.id === step.llm_model_id);
    if (!model) return 'Choose a model from the registry.';
    if (model.modality !== step.output_type) return `${model.name} is ${model.modality === 'image' ? 'an image' : 'a text'} model. Choose a ${step.output_type} model for this step.`;
  }
  return validateTemplate(step.instructions, position);
}

function chainFields(form: FormData) {
  const toneRaw = field(form, 'tone');
  return {
    name: field(form, 'name'),
    description: field(form, 'description') || null,
    input_type: field(form, 'input_type') as InputType,
    tone: (TONES.includes(toneRaw as Tone) ? toneRaw : null) as Tone | null,
    is_active: form.get('is_active') === 'on',
  };
}
function checkChain(c: ReturnType<typeof chainFields>) {
  if (!c.name || c.name.length > 120) return 'Give the chain a name of at most 120 characters.';
  if ((c.description?.length ?? 0) > 2000) return 'Keep the description under 2,000 characters.';
  if (!INPUT_TYPES.includes(c.input_type)) return 'Choose what the chain starts from.';
  return null;
}
const duplicateMessage = (c: { tone: Tone | null }) => c.tone
  ? `Another chain already uses that name or the ${c.tone} tone. Names are unique and each rating-app tone links to one chain.`
  : 'Another chain already uses that name.';

function starterSteps(models: Model[]): StepDraft[] {
  const flash = models.find((m) => m.model_identifier === 'google/gemini-2.5-flash-lite' && m.is_active)?.id
    ?? models.find((m) => m.modality === 'text' && m.is_active)?.id ?? null;
  return [
    { title: 'Describe the picture', output_type: 'text', llm_model_id: flash, attach_input_image: true,
      instructions: 'Describe this image in two or three plain sentences. Mention the setting, the main subject, and anything odd or surprising. Output only the description.' },
    { title: 'Find the joke', output_type: 'text', llm_model_id: flash, attach_input_image: false,
      instructions: 'Here is a description of a picture:\n\n{{previous}}\n\nWrite one funny observation about it. Two sentences maximum. Output only the observation.' },
    { title: 'Write five captions', output_type: 'text', llm_model_id: flash, attach_input_image: false,
      instructions: 'Picture description:\n{{step_1}}\n\nFunny angle:\n{{step_2}}\n\nWrite five short, funny captions for this picture, each under 12 words. Number them 1 to 5 and output nothing else.' },
  ];
}

function parseImport(raw: string, models: Model[]) {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return 'The imported file is not valid JSON.'; }
  const d = data as Record<string, unknown>;
  if (d?.format !== 'caption-archive-chain/v1' || !Array.isArray(d.steps)) return 'Import a file exported from this tool.';
  if (d.steps.length > MAX_STEPS) return `A chain can have at most ${MAX_STEPS} steps.`;
  const steps: StepDraft[] = [];
  for (const [i, s] of (d.steps as Record<string, unknown>[]).entries()) {
    const ident = typeof s.model === 'string' ? s.model : null;
    const output_type: OutputType = s.output_type === 'image' ? 'image' : 'text';
    const model = ident ? models.find((m) => m.model_identifier === ident && m.modality === output_type && m.is_active) ?? models.find((m) => m.model_identifier === ident && m.modality === output_type) : null;
    if (ident && !model) return `Imported step ${i + 1} uses ${ident}, which is not in the model registry.`;
    const step = { title: String(s.title ?? '').trim(), instructions: String(s.instructions ?? '').trim(), output_type, llm_model_id: model?.id ?? null, attach_input_image: s.attach_input_image === true };
    const problem = checkStep(step, i + 1, models);
    if (problem) return `Imported step ${i + 1}: ${problem}`;
    steps.push(step);
  }
  return {
    steps,
    name: typeof d.name === 'string' ? d.name.trim() : '',
    description: typeof d.description === 'string' ? d.description.trim() : '',
    input_type: INPUT_TYPES.includes(d.input_type as InputType) ? d.input_type as InputType : null,
  };
}

async function insertSteps(supabase: Client, chainId: number, steps: StepDraft[]) {
  if (!steps.length) return null;
  const { error } = await supabase.from('prompt_chain_steps').insert(steps.map((s, i) => ({ ...s, prompt_chain_id: chainId, step_order: i + 1 })));
  return error;
}

export async function createChain(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const models = await loadModels(supabase);
  const chain = chainFields(form);
  chain.is_active = true;
  let steps: StepDraft[] = form.get('starter') === 'on' ? starterSteps(models) : [];
  const file = form.get('import');
  if (file instanceof File && file.size > 0) {
    if (file.size > 200_000) return { error: 'The import file is too large.' };
    const parsed = parseImport(await file.text(), models);
    if (typeof parsed === 'string') return { error: parsed };
    steps = parsed.steps;
    chain.name = chain.name || parsed.name.slice(0, 120);
    chain.description = chain.description || parsed.description.slice(0, 2000) || null;
    if (parsed.input_type) chain.input_type = parsed.input_type;
  }
  const problem = checkChain(chain);
  if (problem) return { error: problem };
  const { data, error } = await supabase.from('prompt_chains').insert(chain).select('id').single();
  if (isUnique(error)) return { error: duplicateMessage(chain) };
  if (error || !data) return { error: 'The chain could not be created.' };
  if (await insertSteps(supabase, data.id, steps)) return { error: 'The chain was created, but its steps could not be added.' };
  revalidatePath('/');
  redirect(`/chains/${data.id}?status=created`);
}

export async function updateChain(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const id = idOf(form.get('id'));
  if (!id) return { error: 'Invalid chain.' };
  const chain = chainFields(form);
  const problem = checkChain(chain);
  if (problem) return { error: problem };
  const { error } = await supabase.from('prompt_chains').update(chain).eq('id', id).select('id').single();
  if (isUnique(error)) return { error: duplicateMessage(chain) };
  if (error) return { error: 'The chain could not be saved.' };
  revalidatePath('/'); revalidatePath(`/chains/${id}`);
  return { error: '', ok: 'Chain details saved.' };
}

async function removeRunMedia(supabase: Client, runIds: number[]) {
  for (const runId of runIds) {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).list(`runs/${runId}`);
    if (data?.length) await supabase.storage.from(MEDIA_BUCKET).remove(data.map((f) => `runs/${runId}/${f.name}`));
  }
}

export async function deleteChain(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const id = idOf(form.get('id'));
  if (!id) return { error: 'Invalid chain.' };
  if (field(form, 'confirm_name') !== field(form, 'expected_name')) return { error: 'Type the chain name exactly to confirm.' };
  const { data: runs } = await supabase.from('prompt_chain_runs').select('id').eq('prompt_chain_id', id);
  const { error } = await supabase.from('prompt_chains').delete().eq('id', id).select('id').single();
  if (error) return { error: 'The chain could not be deleted.' };
  await removeRunMedia(supabase, (runs ?? []).map((r) => r.id));
  revalidatePath('/'); revalidatePath('/media');
  redirect('/?status=deleted');
}

export async function duplicateChain(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = idOf(form.get('id'));
  if (!id) return;
  const [{ data: chain }, { data: steps }] = await Promise.all([
    supabase.from('prompt_chains').select('name,description,input_type').eq('id', id).single(),
    supabase.from('prompt_chain_steps').select('title,instructions,output_type,llm_model_id,attach_input_image').eq('prompt_chain_id', id).order('step_order'),
  ]);
  if (!chain) return;
  // The copy never takes over a rating-app tone; names must stay unique.
  let copyId: number | null = null;
  for (let n = 1; n <= 20 && copyId == null; n++) {
    const name = `${chain.name} (copy${n > 1 ? ` ${n}` : ''})`.slice(0, 120);
    const { data, error } = await supabase.from('prompt_chains').insert({ ...chain, name, tone: null, is_active: true }).select('id').single();
    if (data) copyId = data.id;
    else if (!isUnique(error)) return;
  }
  if (copyId == null) return;
  await insertSteps(supabase, copyId, (steps ?? []) as StepDraft[]);
  revalidatePath('/');
  redirect(`/chains/${copyId}?status=duplicated`);
}

function stepFromForm(form: FormData): StepDraft {
  const modelId = idOf(form.get('llm_model_id'));
  return {
    title: field(form, 'title'),
    instructions: String(form.get('instructions') ?? '').trim(),
    output_type: field(form, 'output_type') === 'image' ? 'image' : 'text',
    llm_model_id: modelId,
    attach_input_image: form.get('attach_input_image') === 'on',
  };
}

export async function createStep(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const chainId = idOf(form.get('prompt_chain_id'));
  if (!chainId) return { error: 'Invalid chain.' };
  const [{ count }, models] = await Promise.all([
    supabase.from('prompt_chain_steps').select('id', { count: 'exact', head: true }).eq('prompt_chain_id', chainId),
    loadModels(supabase),
  ]);
  if ((count ?? 0) >= MAX_STEPS) return { error: `A chain can have at most ${MAX_STEPS} steps.` };
  const step = stepFromForm(form);
  const problem = checkStep(step, (count ?? 0) + 1, models);
  if (problem) return { error: problem };
  const { error } = await supabase.from('prompt_chain_steps').insert({ ...step, prompt_chain_id: chainId, step_order: (count ?? 0) + 1 }).select('id').single();
  if (error) return { error: 'The step could not be added.' };
  revalidatePath(`/chains/${chainId}`); revalidatePath('/');
  return { error: '', ok: 'Step added.' };
}

export async function updateStep(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const id = idOf(form.get('id'));
  if (!id) return { error: 'Invalid step.' };
  const [{ data: current }, models] = await Promise.all([
    supabase.from('prompt_chain_steps').select('prompt_chain_id,step_order').eq('id', id).maybeSingle(),
    loadModels(supabase),
  ]);
  if (!current) return { error: 'This step no longer exists. Refresh the page.' };
  const step = stepFromForm(form);
  const problem = checkStep(step, current.step_order, models);
  if (problem) return { error: problem };
  const { error } = await supabase.from('prompt_chain_steps').update(step).eq('id', id).select('id').single();
  if (error) return { error: 'The step could not be saved.' };
  revalidatePath(`/chains/${current.prompt_chain_id}`);
  return { error: '', ok: 'Saved.' };
}

export async function deleteStep(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const id = idOf(form.get('id'));
  if (!id) return { error: 'Invalid step.' };
  const { data: step } = await supabase.from('prompt_chain_steps').select('prompt_chain_id,step_order').eq('id', id).maybeSingle();
  if (!step) return { error: 'This step no longer exists. Refresh the page.' };
  // Later steps move up one place: renumber their {{step_N}} references, and refuse if one
  // depends on the step being deleted.
  const { data: later } = await supabase.from('prompt_chain_steps').select('id,title,instructions,step_order').eq('prompt_chain_id', step.prompt_chain_id).gt('step_order', step.step_order);
  const shift = (n: number) => (n === step.step_order ? null : n > step.step_order ? n - 1 : n);
  const rewrites: { id: number; instructions: string }[] = [];
  for (const s of later ?? []) {
    const { text, broken } = remapReferences(s.instructions, shift);
    if (broken != null) return { error: `Step ${s.step_order} (“${s.title}”) uses {{step_${broken}}}, the output of this step. Edit that prompt before deleting.` };
    if (s.step_order === step.step_order + 1 && /\{\{\s*previous\s*\}\}/.test(s.instructions) && step.step_order === 1) {
      return { error: `Step 2 (“${s.title}”) uses {{previous}} and would become step 1. Edit it to use {{input}} first.` };
    }
    if (text !== s.instructions) rewrites.push({ id: s.id, instructions: text });
  }
  const { error } = await supabase.from('prompt_chain_steps').delete().eq('id', id).select('id').single();
  if (error) return { error: 'The step could not be deleted.' };
  for (const r of rewrites) await supabase.from('prompt_chain_steps').update({ instructions: r.instructions }).eq('id', r.id);
  revalidatePath(`/chains/${step.prompt_chain_id}`); revalidatePath('/');
  return { error: '', ok: 'Step deleted.' };
}

/** Saves a complete new order after checking that every prompt still points at earlier steps. */
export async function reorderSteps(chainId: number, stepIds: number[]): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  if (!idOf(chainId) || !Array.isArray(stepIds) || stepIds.length > MAX_STEPS || stepIds.some((s) => !idOf(s))) return { error: 'Invalid order.' };
  const { data: steps } = await supabase.from('prompt_chain_steps').select('id,title,instructions,step_order').eq('prompt_chain_id', chainId);
  const byId = new Map((steps ?? []).map((s) => [s.id as number, s]));
  if (byId.size !== stepIds.length || stepIds.some((sid) => !byId.has(sid))) return { error: 'The step list changed. Refresh and try again.' };
  const newPosition = new Map(stepIds.map((sid, i) => [byId.get(sid)!.step_order as number, i + 1]));
  const instructions: string[] = [];
  for (const [i, sid] of stepIds.entries()) {
    const s = byId.get(sid)!;
    const { text } = remapReferences(s.instructions, (n) => newPosition.get(n) ?? null);
    const problem = validateTemplate(text, i + 1);
    if (problem) return { error: `“${s.title}” can't move to position ${i + 1}. ${problem}` };
    instructions.push(text);
  }
  const { error } = await supabase.rpc('reorder_prompt_chain_steps', { p_chain_id: chainId, p_step_ids: stepIds, p_instructions: instructions });
  if (error) return { error: 'The new order could not be saved.' };
  revalidatePath(`/chains/${chainId}`);
  return { error: '', ok: 'Order saved.' };
}

export async function deleteRun(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const id = idOf(form.get('id'));
  if (!id) return { error: 'Invalid run.' };
  const { data, error } = await supabase.from('prompt_chain_runs').delete().eq('id', id).select('prompt_chain_id').single();
  if (error || !data) return { error: 'The run could not be deleted.' };
  await removeRunMedia(supabase, [id]);
  revalidatePath(`/chains/${data.prompt_chain_id}`); revalidatePath(`/chains/${data.prompt_chain_id}/media`); revalidatePath('/media'); revalidatePath('/');
  redirect(`/chains/${data.prompt_chain_id}/media?status=run-deleted`);
}

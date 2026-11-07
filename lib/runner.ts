import { generateImage, generateText, type UserModelMessage } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageModel, languageModel } from './ai';
import { IMAGE_TYPES, MEDIA_BUCKET, signedUrl } from './media';
import { renderTemplate } from './template';
import type { Chain, Model, RunEvent, RunStep, Step } from './types';

export const RUNS_PER_HOUR = 20;
export const MAX_STEPS = 25;
const TEXT_TIMEOUT_MS = 60_000;
const IMAGE_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 1500;
const MAX_IMAGE_PROMPT = 2000;

type RunInput = { text: string; image: { bytes: Uint8Array; mediaType: string } | null };

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/free tier users do not have access/i.test(message)) return 'This model is not available on the AI Gateway free tier. Choose another model for this step.';
  return message.split('\n')[0].replace(/(api[_-]?key|token|bearer)\S*/gi, '[redacted]').slice(0, 300) || 'The model call failed.';
}

/** Runs every step in order, persisting the run and each step, and reports progress through `emit`. */
export async function executeChain(options: {
  supabase: SupabaseClient; userId: string; chain: Chain; steps: Step[]; models: Model[]; input: RunInput; emit: (event: RunEvent) => void;
}) {
  const { supabase, userId, chain, steps, models, input, emit } = options;
  const { data: run, error: runError } = await supabase.from('prompt_chain_runs')
    .insert({ prompt_chain_id: chain.id, chain_name: chain.name, started_by: userId, input_text: input.text || null })
    .select('id').single();
  if (runError || !run) throw new Error('Could not start the run.');
  const runId = run.id as number;
  emit({ type: 'start', runId, totalSteps: steps.length });

  if (input.image) {
    const path = `runs/${runId}/input.${IMAGE_TYPES[input.image.mediaType]}`;
    const upload = await supabase.storage.from(MEDIA_BUCKET).upload(path, input.image.bytes, { contentType: input.image.mediaType, upsert: true });
    if (!upload.error) await supabase.from('prompt_chain_runs').update({ input_image_path: path }).eq('id', runId);
  }

  const outputs = new Map<number, string>();
  const inputText = input.text || (input.image ? '(the attached image)' : '');
  let failure: string | null = null;

  for (const step of steps) {
    const position = step.step_order;
    const model = models.find((m) => m.id === step.llm_model_id) ?? null;
    emit({ type: 'step-start', position, name: step.title, model: model?.name ?? null, outputType: step.output_type });
    const prompt = renderTemplate(step.instructions, position, { input: inputText, outputs, tone: chain.tone });
    const started = Date.now();
    let status: RunStep['status'] = 'succeeded';
    let outputText: string | null = null;
    let imagePath: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let error: string | null = null;

    try {
      if (!model) {
        // Documentation-only steps (e.g. the rating app's validation step) pass the previous output through.
        status = 'skipped';
        outputs.set(position, outputs.get(position - 1) ?? inputText);
      } else if (step.output_type === 'text') {
        if (model.modality !== 'text') throw new Error(`${model.name} generates images; choose a text model for this step.`);
        const content: UserModelMessage['content'] = step.attach_input_image && input.image
          ? [{ type: 'text', text: prompt }, { type: 'image', image: input.image.bytes, mediaType: input.image.mediaType }]
          : prompt;
        const result = await generateText({
          model: languageModel(model).model, messages: [{ role: 'user', content }],
          maxOutputTokens: model.max_output_tokens ?? DEFAULT_MAX_TOKENS,
          ...(model.temperature != null ? { temperature: Number(model.temperature) } : {}),
          maxRetries: 1, timeout: TEXT_TIMEOUT_MS,
        });
        outputText = result.text.trim();
        if (!outputText) throw new Error(result.finishReason === 'length' ? 'The model ran out of output tokens before answering.' : 'The model returned an empty response.');
        inputTokens = result.usage.inputTokens ?? null;
        outputTokens = result.usage.outputTokens ?? null;
        outputs.set(position, outputText);
      } else {
        if (model.modality !== 'image') throw new Error(`${model.name} writes text; choose an image model for this step.`);
        const text = prompt.slice(0, MAX_IMAGE_PROMPT);
        const result = await generateImage({
          model: imageModel(model),
          prompt: step.attach_input_image && input.image && model.accepts_images ? { text, images: [input.image.bytes] } : text,
          n: 1, maxRetries: 1, abortSignal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        });
        const mediaType = IMAGE_TYPES[result.image.mediaType] ? result.image.mediaType : 'image/png';
        imagePath = `runs/${runId}/step-${position}.${IMAGE_TYPES[mediaType]}`;
        const upload = await supabase.storage.from(MEDIA_BUCKET).upload(imagePath, result.image.uint8Array, { contentType: mediaType, upsert: true });
        if (upload.error) { imagePath = null; throw new Error('The image was generated but could not be stored.'); }
        // Later steps that reference an image step receive the prompt that produced it.
        outputs.set(position, `[image generated from: ${text}]`);
      }
    } catch (e) {
      status = 'failed';
      error = safeError(e);
    }

    const durationMs = Date.now() - started;
    await supabase.from('prompt_chain_run_steps').insert({
      run_id: runId, prompt_chain_step_id: step.id, step_order: position, title: step.title, model: model?.model_identifier ?? null,
      output_type: step.output_type, prompt_sent: prompt, output_text: outputText, output_image_path: imagePath,
      status, error, input_tokens: inputTokens, output_tokens: outputTokens, duration_ms: durationMs,
    });
    emit({ type: 'step-done', position, status, outputText, imageUrl: await signedUrl(supabase, imagePath), error, durationMs, inputTokens, outputTokens });
    if (status === 'failed') { failure = `Step ${position} (${step.title}) failed: ${error}`; break; }
  }

  const final = failure ? 'failed' : 'succeeded';
  await supabase.from('prompt_chain_runs').update({ status: final, error: failure?.slice(0, 1000) ?? null, finished_at: new Date().toISOString() }).eq('id', runId);
  emit({ type: 'done', runId, status: final, error: failure });
  return runId;
}

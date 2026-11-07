// Live smoke test of the chain runner against the real AI Gateway, with an in-memory
// stand-in for Supabase. Usage: npx tsx tests/smoke/run-chain.ts <image-path>
import { readFileSync, writeFileSync } from 'node:fs';
import { executeChain } from '../../lib/runner';
import type { Chain, Model, Step } from '../../lib/types';

const inserts: Record<string, unknown[]> = {};
const files: Record<string, Uint8Array> = {};
const table = (name: string) => ({
  insert(row: unknown) { (inserts[name] ??= []).push(row); return { select: () => ({ single: async () => ({ data: { id: 1 }, error: null }) }), then: (r: (v: unknown) => void) => r({ error: null }) }; },
  update(row: unknown) { (inserts[`${name}:update`] ??= []).push(row); return { eq: async () => ({ error: null }) }; },
});
const supabase = {
  from: table,
  storage: { from: () => ({
    upload: async (path: string, bytes: Uint8Array) => { files[path] = bytes; return { error: null }; },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `signed://${path}` } }),
  }) },
} as never;

const gw = { name: 'Vercel AI Gateway', credential_env: 'AI_GATEWAY_API_KEY' };
const models: Model[] = [
  { id: 10, provider_id: 2, name: 'Gemini 2.5 Flash-Lite', model_identifier: 'google/gemini-2.5-flash-lite', modality: 'text', accepts_images: true, is_active: true, max_output_tokens: 1500, temperature: null, llm_providers: gw },
  { id: 11, provider_id: 2, name: 'Recraft v4.1 Flash', model_identifier: 'recraft/recraft-v4.1-flash', modality: 'image', accepts_images: false, is_active: true, max_output_tokens: null, temperature: null, llm_providers: gw },
];
const chain: Chain = { id: 99, name: 'Picture to five captions', tone: null, description: null, is_active: true, input_type: 'image', created_at: '', updated_at: '' };
const s = (step_order: number, title: string, instructions: string, llm_model_id: number | null, output_type: 'text' | 'image', attach_input_image = false): Step =>
  ({ id: step_order, prompt_chain_id: 99, step_order, title, instructions, llm_model_id, output_type, attach_input_image, created_at: '', updated_at: '' });
const steps = [
  s(1, 'Describe the picture', 'Describe this image in two or three plain sentences. Output only the description.', 10, 'text', true),
  s(2, 'Find the joke', 'Here is a description of a picture:\n\n{{previous}}\n\nWrite one funny observation about it. Two sentences maximum.', 10, 'text'),
  s(3, 'Write five captions', 'Description:\n{{step_1}}\n\nAngle:\n{{step_2}}\n\nWrite five short funny captions, each under 12 words, numbered 1 to 5.', 10, 'text'),
  s(4, 'Validate', 'No model call.', null, 'text'),
  s(5, 'Poster', 'A bold, clean meme poster illustration. Scene: {{step_1}} Caption at the bottom: the first caption from {{step_3}}', 11, 'image'),
];

const path = process.argv[2];
const bytes = new Uint8Array(readFileSync(path));
const mediaType = path.endsWith('.webp') ? 'image/webp' : path.endsWith('.png') ? 'image/png' : 'image/jpeg';
const events: unknown[] = [];
await executeChain({ supabase, userId: 'test', chain, steps, models, input: { text: '', image: { bytes, mediaType } }, emit: (e) => { events.push(e); console.log(JSON.stringify(e).slice(0, 400)); } });
for (const [p, b] of Object.entries(files)) if (p.includes('step-')) writeFileSync(`${process.env.OUT ?? '.'}/poster.${p.split('.').pop()}`, b);
console.log('stored files:', Object.keys(files));
console.log('run steps saved:', (inserts.prompt_chain_run_steps ?? []).map((r) => (r as { status: string; title: string }).title + '=' + (r as { status: string }).status));

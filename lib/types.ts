export type InputType = 'image' | 'text' | 'none';
export type OutputType = 'text' | 'image';
export const TONES = ['Deadpan', 'Unhinged', 'Wholesome'] as const;
export type Tone = (typeof TONES)[number];

export type Chain = {
  id: number; name: string; tone: Tone | null; description: string | null; is_active: boolean;
  input_type: InputType; created_at: string; updated_at: string;
};
export type Step = {
  id: number; prompt_chain_id: number; step_order: number; title: string; instructions: string;
  llm_model_id: number | null; output_type: OutputType; attach_input_image: boolean; created_at: string; updated_at: string;
};
export type Model = {
  id: number; provider_id: number; name: string; model_identifier: string; modality: OutputType;
  accepts_images: boolean; is_active: boolean; max_output_tokens: number | null; temperature: number | null;
  llm_providers: { name: string; credential_env: string | null } | null;
};
export type Run = {
  id: number; prompt_chain_id: number; chain_name: string; started_by: string | null;
  status: 'running' | 'succeeded' | 'failed'; input_text: string | null; input_image_path: string | null;
  error: string | null; created_at: string; finished_at: string | null;
};
export type RunStep = {
  id: number; run_id: number; prompt_chain_step_id: number | null; step_order: number; title: string; model: string | null;
  output_type: OutputType; prompt_sent: string; output_text: string | null; output_image_path: string | null;
  status: 'succeeded' | 'failed' | 'skipped'; error: string | null; input_tokens: number | null; output_tokens: number | null;
  duration_ms: number | null; created_at: string;
};

/** Events streamed by POST /api/chains/[id]/run while a chain executes. */
export type RunEvent =
  | { type: 'start'; runId: number; totalSteps: number }
  | { type: 'step-start'; position: number; name: string; model: string | null; outputType: OutputType }
  | { type: 'step-done'; position: number; status: RunStep['status']; outputText: string | null; imageUrl: string | null; error: string | null; durationMs: number; inputTokens: number | null; outputTokens: number | null }
  | { type: 'done'; runId: number; status: 'succeeded' | 'failed'; error: string | null };

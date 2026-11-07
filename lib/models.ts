import type { SupabaseClient } from '@supabase/supabase-js';
import type { Model } from './types';

export const MODEL_SELECT = 'id,provider_id,name,model_identifier,modality,accepts_images,is_active,max_output_tokens,temperature,llm_providers(name,credential_env)';

/** The Week 7 model registry (llm_models), shared with the admin panel. */
export async function loadModels(supabase: SupabaseClient) {
  const { data } = await supabase.from('llm_models').select(MODEL_SELECT).order('modality').order('name').returns<Model[]>();
  return data ?? [];
}

/** Models offered in pickers: active ones, plus whatever a step already uses. */
export function pickable(models: Model[], modality: 'text' | 'image', currentId?: number | null) {
  return models.filter((m) => m.modality === modality && (m.is_active || m.id === currentId));
}

export function modelName(models: Model[], id: number | null | undefined) {
  if (id == null) return 'No model call';
  return models.find((m) => m.id === id)?.name ?? `Model #${id}`;
}

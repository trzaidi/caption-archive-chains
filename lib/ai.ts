import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { gateway, type LanguageModel } from 'ai';
import type { Model } from './types';

/**
 * Text models run through the Vercel AI Gateway (OIDC on Vercel, VERCEL_OIDC_TOKEN locally).
 * Models registered under a provider whose credential is GEMINI_API_KEY call Google directly
 * when that key is configured, the same way the rating app does.
 */
export function languageModel(model: Model): { model: LanguageModel; route: 'gemini' | 'gateway' } {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (key && model.llm_providers?.credential_env === 'GEMINI_API_KEY' && model.model_identifier.startsWith('google/')) {
    return { model: createGoogleGenerativeAI({ apiKey: key })(model.model_identifier.slice('google/'.length)), route: 'gemini' };
  }
  return { model: gateway(model.model_identifier), route: 'gateway' };
}

export function imageModel(model: Model) {
  return gateway.imageModel(model.model_identifier);
}

// Prompt templates can reference the chain input and earlier outputs:
//   {{input}}     the text the chain was started with (or a note that an image was attached)
//   {{previous}}  the text output of the step right before this one
//   {{step_N}}    the text output of step N (N must be an earlier step)
const VARIABLE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function findVariables(template: string) {
  return Array.from(template.matchAll(VARIABLE), (m) => m[1]);
}

/** Returns a human-readable problem, or null when every reference is valid for a step at `position`. */
export function validateTemplate(template: string, position: number) {
  for (const name of findVariables(template)) {
    if (name === 'input' || name === 'previous') {
      if (name === 'previous' && position === 1) return 'Step 1 has no previous step; use {{input}} instead.';
      continue;
    }
    const match = /^step_(\d+)$/.exec(name);
    if (!match) return `Unknown variable {{${name}}}. Use {{input}}, {{previous}} or {{step_N}}.`;
    const ref = Number(match[1]);
    if (ref < 1 || ref >= position) return `{{${name}}} must point at an earlier step (this is step ${position}).`;
  }
  return null;
}

export type TemplateContext = { input: string; outputs: Map<number, string>; tone?: string | null };

// The Week 7 tone chains were written for the rating app with single-brace placeholders.
const LEGACY = /\{(scene|tone|context)\}/g;

export function renderTemplate(template: string, position: number, context: TemplateContext) {
  const legacy = template.replace(LEGACY, (_, name: string) => name === 'scene' ? context.input : name === 'tone' ? context.tone ?? '' : '');
  return legacy.replace(VARIABLE, (_, name: string) => {
    if (name === 'input') return context.input;
    if (name === 'previous') return context.outputs.get(position - 1) ?? '';
    const match = /^step_(\d+)$/.exec(name);
    return match ? context.outputs.get(Number(match[1])) ?? '' : '';
  });
}

/**
 * Rewrites {{step_N}} so references keep pointing at the same step after a reorder or delete.
 * `map` returns the referenced step's new position, or null if it no longer exists.
 */
export function remapReferences(template: string, map: (oldPosition: number) => number | null) {
  let broken: number | null = null;
  const text = template.replace(/\{\{\s*step_(\d+)\s*\}\}/g, (whole, n: string) => {
    const next = map(Number(n));
    if (next == null) { broken = Number(n); return whole; }
    return `{{step_${next}}}`;
  });
  return { text, broken: broken as number | null };
}

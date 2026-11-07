'use client';
import { useRef, useState } from 'react';
import { validateTemplate } from '@/lib/template';

/** Prompt textarea with insertable variables and live reference checking. */
export function PromptField({ position, defaultValue, inputType }: { position: number; defaultValue: string; inputType: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const problem = value.trim() ? validateTemplate(value, position) : null;
  const vars = [
    ...(inputType !== 'none' ? [{ token: '{{input}}', hint: 'Chain input text' }] : []),
    ...(position > 1 ? [{ token: '{{previous}}', hint: `Output of step ${position - 1}` }] : []),
    ...Array.from({ length: Math.max(0, position - 2) }, (_, i) => ({ token: `{{step_${i + 1}}}`, hint: `Output of step ${i + 1}` })),
  ];
  function insert(token: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }
  return (
    <label className="field">
      <span>Prompt</span>
      <textarea ref={ref} className="prompt" name="instructions" required maxLength={8000} value={value} onChange={(e) => setValue(e.target.value)}
        aria-invalid={Boolean(problem)} aria-describedby={`vars-${position}`} />
      <div className="vars" id={`vars-${position}`}>
        {vars.length ? <>Insert: {vars.map((v) => <button type="button" key={v.token} title={v.hint} onClick={() => insert(v.token)}>{v.token}</button>)}</> : <span>Step 1 of a no-input chain is self-contained.</span>}
        <span style={{ marginLeft: 'auto' }}>{value.length.toLocaleString()} / 8,000</span>
      </div>
      {problem && <small style={{ color: 'var(--danger)' }} role="alert">{problem}</small>}
    </label>
  );
}

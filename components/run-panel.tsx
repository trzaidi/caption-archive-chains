'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InputType, RunEvent } from '@/lib/types';
import { duration } from '@/lib/format';
import { Icon } from './icons';

type Progress = { position: number; name: string; model: string | null; outputType: 'text' | 'image'; status: 'running' | 'succeeded' | 'failed' | 'skipped'; outputText?: string | null; imageUrl?: string | null; error?: string | null; durationMs?: number };
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function RunPanel({ chainId, inputType, stepCount, remaining, limit }: { chainId: number; inputType: InputType; stepCount: number; remaining: number; limit: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [steps, setSteps] = useState<Progress[]>([]);
  const [result, setResult] = useState<{ runId: number; status: string; error: string | null } | null>(null);

  function pick(f: File | undefined | null) {
    setError('');
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError('Choose a PNG, JPEG, WebP or GIF image.');
    if (f.size > MAX_BYTES) return setError('Images must be 4 MB or smaller.');
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  }

  async function run() {
    if (inputType === 'image' && !file) return setError('Upload an image to start this chain.');
    if (inputType === 'text' && !text.trim()) return setError('Enter some input text to start this chain.');
    setError(''); setSteps([]); setResult(null); setRunning(true);
    const body = new FormData();
    body.set('input_text', text);
    if (file) body.set('input_image', file);
    try {
      const response = await fetch(`/api/chains/${chainId}/run`, { method: 'POST', body });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? 'The run could not start.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as RunEvent);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The run failed.');
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  function handle(event: RunEvent) {
    if (event.type === 'step-start') setSteps((s) => [...s, { position: event.position, name: event.name, model: event.model, outputType: event.outputType, status: 'running' }]);
    if (event.type === 'step-done') setSteps((s) => s.map((p) => p.position === event.position ? { ...p, status: event.status, outputText: event.outputText, imageUrl: event.imageUrl, error: event.error, durationMs: event.durationMs } : p));
    if (event.type === 'done') { setResult({ runId: event.runId, status: event.status, error: event.error }); if (event.status === 'failed' && event.error && !event.runId) setError(event.error); }
  }

  const disabled = running || stepCount === 0 || remaining <= 0;
  return (
    <div className="card">
      <div className="cardhead"><h2>Run this chain</h2><span className={`badge${remaining <= 3 ? ' run' : ''}`} title={`Each superadmin can start ${limit} runs per hour`}>{remaining} of {limit} runs left this hour</span></div>
      <div className="form">
        {inputType === 'image' && (
          <div className={`drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
            {preview ? <img src={preview} alt="Selected input" /> : <><Icon.image /><b>Drop an image or click to choose</b><span className="muted small">PNG, JPEG, WebP or GIF up to 4 MB</span></>}
            <input ref={fileRef} type="file" accept={TYPES.join(',')} aria-label="Input image" onChange={(e) => pick(e.target.files?.[0])} disabled={running} />
          </div>
        )}
        {inputType !== 'none' && (
          <label className="field"><span>{inputType === 'image' ? 'Extra context (optional)' : 'Input text'}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={8000} disabled={running}
              placeholder={inputType === 'image' ? 'Available to prompts as {{input}}' : 'A topic, scene or anything your first step expects'} style={{ minHeight: 70 }} />
          </label>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="btn primary" onClick={run} disabled={disabled}>
          {running ? <><span className="spinner" /> Running step {steps.length} of {stepCount}…</> : <><Icon.play /> Run {stepCount} step{stepCount === 1 ? '' : 's'}</>}
        </button>
        {stepCount === 0 && <p className="muted small">Add a step before running.</p>}
        {remaining <= 0 && <p className="muted small">You have used this hour&apos;s {limit} runs. The limit protects the shared AI Gateway balance.</p>}
      </div>
      {steps.length > 0 && (
        <ol className="progress" aria-live="polite" style={{ marginTop: 18 }}>
          {steps.map((s) => (
            <li key={s.position}>
              <div className="row">
                <b>{s.position}. {s.name}</b>
                {s.status === 'running' ? <span className="badge run"><span className="spinner" /> Running</span>
                  : s.status === 'succeeded' ? <span className="badge ok">Done · {duration(s.durationMs)}</span>
                  : s.status === 'skipped' ? <span className="badge" title="No model call; the previous output passes through">Skipped</span>
                  : <span className="badge fail">Failed</span>}
              </div>
              {s.outputText && <div className="out">{s.outputText}</div>}
              {s.imageUrl && <img src={s.imageUrl} alt={`Generated by step ${s.position}`} />}
              {s.error && <p className="notice error" style={{ margin: 0 }}>{s.error}</p>}
            </li>
          ))}
        </ol>
      )}
      {result && result.runId > 0 && (
        <p className={`notice ${result.status === 'succeeded' ? 'ok' : 'error'}`} style={{ marginTop: 14 }} role="status">
          {result.status === 'succeeded' ? 'Run complete. ' : 'Run stopped. '}
          <Link className="hl" href={`/runs/${result.runId}`}>Open the full trace →</Link>
        </p>
      )}
    </div>
  );
}

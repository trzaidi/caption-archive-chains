import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signedUrls } from '@/lib/media';
import { ago } from '@/lib/format';
import type { Run, RunStep } from '@/lib/types';
import { RATING_APP_ORIGIN, type ChainCaption } from '@/lib/captions';

export type RunWithSteps = Run & { prompt_chain_run_steps: RunStep[] };
export const RUN_SELECT = '*, prompt_chain_run_steps(*)';
export const PAGE_SIZE = 24;

/** Signs every image a page of runs needs in one storage request. */
export async function signRuns(supabase: SupabaseClient, runs: RunWithSteps[]) {
  return signedUrls(supabase, runs.flatMap((r) => [r.input_image_path, ...r.prompt_chain_run_steps.map((s) => s.output_image_path)]));
}

export function MediaGrid({ runs, urls, showChain }: { runs: RunWithSteps[]; urls: Map<string, string>; showChain?: boolean }) {
  return (
    <div className="gallery">
      {runs.map((run) => {
        const steps = [...run.prompt_chain_run_steps].sort((a, b) => a.step_order - b.step_order);
        const generated = steps.filter((s) => s.output_image_path).map((s) => urls.get(s.output_image_path!)).filter(Boolean) as string[];
        const input = run.input_image_path ? urls.get(run.input_image_path) : undefined;
        const finalText = [...steps].reverse().find((s) => s.output_text)?.output_text;
        const pics = [input, generated.at(-1)].filter(Boolean) as string[];
        return (
          <Link key={run.id} href={`/runs/${run.id}`} className="card mediacard">
            <div className={`thumbs${pics.length < 2 ? ' one' : ''}`}>
              {pics.length ? pics.map((src, i) => <img key={i} src={src} alt={i === 0 && input ? 'Run input' : 'Generated image'} loading="lazy" />)
                : <div className="ph">{run.input_text ? `“${run.input_text.slice(0, 120)}”` : 'Text-only run'}</div>}
            </div>
            <div className="mediabody">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b className="small">{showChain ? run.chain_name : `Test run #${run.id}`}</b>
                <span className={`badge ${run.status === 'succeeded' ? 'ok' : run.status === 'failed' ? 'fail' : 'run'}`}>{run.status}</span>
              </div>
              {finalText ? <div className="out">{finalText}</div> : <p className="muted small" style={{ margin: 0 }}>{run.error ?? 'No text output.'}</p>}
              <div className="meta"><span>{ago(run.created_at)}</span><span>{steps.length} step{steps.length === 1 ? '' : 's'}</span>{generated.length > 0 && <span>{generated.length} image{generated.length === 1 ? '' : 's'}</span>}{showChain && <span>Run #{run.id}</span>}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function Pager({ page, hasMore, base }: { page: number; hasMore: boolean; base: string }) {
  const sep = base.includes('?') ? '&' : '?';
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      {page > 1 ? <Link className="btn sm" href={`${base}${sep}page=${page - 1}`}>← Newer</Link> : <span />}
      {hasMore ? <Link className="btn sm" href={`${base}${sep}page=${page + 1}`}>Older →</Link> : <span />}
    </nav>
  );
}


export function CaptionGrid({ rows }: { rows: ChainCaption[] }) {
  return (
    <div className="gallery">
      {rows.map((r) => {
        const c = r.captions!;
        return (
          <a key={r.id} href={`${RATING_APP_ORIGIN}/c/${c.id}`} target="_blank" rel="noreferrer" className="card mediacard">
            <div className="thumbs one">
              {c.image_path ? <img src={`${RATING_APP_ORIGIN}${c.image_path}`} alt={c.image_description.slice(0, 120)} loading="lazy" /> : <div className="ph">No picture</div>}
            </div>
            <div className="mediabody">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b className="small">Caption #{c.id}</b>
                {c.tone && <span className="badge accent">{c.tone}</span>}
              </div>
              <div className="out">{c.caption_text}</div>
              <div className="meta"><span>{ago(c.created_at)}</span><span>{r.model}</span>{r.latency_ms != null && <span>{(r.latency_ms / 1000).toFixed(1)} s</span>}<span>Open in rating app ↗</span></div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

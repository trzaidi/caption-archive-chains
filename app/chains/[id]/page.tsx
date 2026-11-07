import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { StepList } from '@/components/steps';
import { RunPanel } from '@/components/run-panel';
import { ChainDetailsForm, DeleteChainButton } from '@/components/chain-forms';
import { duplicateChain } from '@/app/actions';
import { requireAdmin } from '@/lib/admin';
import { loadModels } from '@/lib/models';
import { MAX_STEPS, RUNS_PER_HOUR } from '@/lib/runner';
import { ago, when } from '@/lib/format';
import type { Chain, Run, Step } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { created: 'Chain created. Add or adjust steps, then run it.', duplicated: 'Copy created. You are now editing the copy.' };

export default async function ChainPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const { supabase, user } = await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const { status } = await searchParams;
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [{ data: chain }, { data: steps }, { data: runs, count: runCount }, { count: recent }, { count: captionCount }, models] = await Promise.all([
    supabase.from('prompt_chains').select('*').eq('id', id).maybeSingle<Chain>(),
    supabase.from('prompt_chain_steps').select('*').eq('prompt_chain_id', id).order('step_order').returns<Step[]>(),
    supabase.from('prompt_chain_runs').select('*', { count: 'exact' }).eq('prompt_chain_id', id).order('created_at', { ascending: false }).limit(6).returns<Run[]>(),
    supabase.from('prompt_chain_runs').select('id', { count: 'exact', head: true }).eq('started_by', user.id).gte('created_at', since),
    supabase.from('llm_responses').select('id', { count: 'exact', head: true }).eq('prompt_chain_id', id).not('caption_id', 'is', null),
    loadModels(supabase),
  ]);
  if (!chain) notFound();
  const mediaCount = (runCount ?? 0) + (captionCount ?? 0);

  return (
    <Shell active="/" email={user.email ?? ''}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Chains</Link><span>/</span><span>{chain.name}</span></nav>
      <div className="pagehead">
        <div>
          <h1>{chain.name}</h1>
          <p>
            {chain.description || 'No description.'}{' '}
            {chain.tone && <span className="badge accent">{chain.tone} tone</span>}{' '}
            {!chain.is_active && <span className="badge">Inactive</span>}{' '}
            <span className="muted small">Updated {ago(chain.updated_at)}.</span>
          </p>
        </div>
        <div className="row">
          <form action={duplicateChain}><input type="hidden" name="id" value={chain.id} /><button className="btn"><Icon.copy />Duplicate</button></form>
          <a className="btn" href={`/api/chains/${chain.id}/export`} download><Icon.download />Export</a>
        </div>
      </div>
      <nav className="tabs" aria-label="Chain sections">
        <Link href={`/chains/${chain.id}`} aria-current="page">Steps &amp; run</Link>
        <Link href={`/chains/${chain.id}/media`}>Generated media ({mediaCount})</Link>
      </nav>
      {status && STATUS[status] && <p className="notice ok" role="status" style={{ marginBottom: 20 }}>{STATUS[status]}</p>}
      {chain.tone && <p className="notice info small" style={{ marginBottom: 20 }}>This chain documents the rating app&apos;s {chain.tone} pipeline, and published {chain.tone} captions are logged against it. Editing it here changes the documented chain and test runs, not the live rating app prompt.</p>}
      <div className="editor">
        <section aria-label="Steps">
          <StepList chainId={chain.id} steps={steps ?? []} inputType={chain.input_type} models={models} maxSteps={MAX_STEPS} />
          <div className="card" style={{ marginTop: 24 }}>
            <details className="disclose" open={status === 'created' ? false : undefined}>
              <summary>Chain details</summary>
              <ChainDetailsForm chain={chain} />
              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '20px 0' }} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted small">Created {when(chain.created_at)}</span>
                <DeleteChainButton chain={chain} runCount={runCount ?? 0} captionCount={captionCount ?? 0} />
              </div>
            </details>
          </div>
        </section>
        <aside className="sticky" aria-label="Run">
          <RunPanel chainId={chain.id} inputType={chain.input_type} stepCount={steps?.length ?? 0} remaining={Math.max(0, RUNS_PER_HOUR - (recent ?? 0))} limit={RUNS_PER_HOUR} />
          <div className="card">
            <div className="cardhead"><h2>Recent runs</h2><Link className="hl small" href={`/chains/${chain.id}/media`}>All media →</Link></div>
            {runs?.length ? (
              <ul className="runlist">
                {runs.map((r) => (
                  <li key={r.id}><Link href={`/runs/${r.id}`}>
                    <span>Run #{r.id} <span className="muted small">· {ago(r.created_at)}</span></span>
                    <span className={`badge ${r.status === 'succeeded' ? 'ok' : r.status === 'failed' ? 'fail' : 'run'}`}>{r.status}</span>
                  </Link></li>
                ))}
              </ul>
            ) : <p className="muted small" style={{ margin: 0 }}>No test runs yet.</p>}
          </div>
          <div className="card">
            <h2>How prompts connect</h2>
            <p className="small muted" style={{ marginBottom: 6 }}><code className="hl">{'{{input}}'}</code> is the text you start a run with.</p>
            <p className="small muted" style={{ marginBottom: 6 }}><code className="hl">{'{{previous}}'}</code> is the output of the step just before.</p>
            <p className="small muted" style={{ marginBottom: 6 }}><code className="hl">{'{{step_2}}'}</code> is the output of step 2. These references follow their step when you reorder or delete.</p>
            <p className="small muted" style={{ margin: 0 }}>The rating app&apos;s <code>{'{scene}'}</code>, <code>{'{tone}'}</code> and <code>{'{context}'}</code> placeholders are filled too.</p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

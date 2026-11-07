import Link from 'next/link';
import { Shell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { requireAdmin } from '@/lib/admin';
import { ago } from '@/lib/format';
import type { Chain } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { deleted: 'Chain deleted.' };
type StepRow = { prompt_chain_id: number; title: string; output_type: string; step_order: number; llm_model_id: number | null };
type RunRow = { prompt_chain_id: number; status: string; created_at: string };

export default async function Home({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { supabase, user } = await requireAdmin();
  const { status, q } = await searchParams;
  const [chains, steps, runs, captions, images] = await Promise.all([
    supabase.from('prompt_chains').select('*').order('is_active', { ascending: false }).order('updated_at', { ascending: false }).returns<Chain[]>(),
    supabase.from('prompt_chain_steps').select('prompt_chain_id,title,output_type,step_order,llm_model_id').order('step_order').returns<StepRow[]>(),
    supabase.from('prompt_chain_runs').select('prompt_chain_id,status,created_at').order('created_at', { ascending: false }).limit(2000).returns<RunRow[]>(),
    supabase.from('llm_responses').select('prompt_chain_id').not('caption_id', 'is', null).not('prompt_chain_id', 'is', null).limit(5000),
    supabase.from('prompt_chain_run_steps').select('id', { count: 'exact', head: true }).not('output_image_path', 'is', null),
  ]);
  if (chains.error) throw new Error('Unable to load chains.');
  const group = <T extends { prompt_chain_id: number }>(rows: T[] | null) => {
    const map = new Map<number, T[]>();
    for (const r of rows ?? []) map.set(r.prompt_chain_id, [...(map.get(r.prompt_chain_id) ?? []), r]);
    return map;
  };
  const stepsBy = group(steps.data);
  const runsBy = group(runs.data);
  const captionsBy = group((captions.data ?? []) as { prompt_chain_id: number }[]);
  const allRuns = runs.data ?? [];
  const finished = allRuns.filter((r) => r.status !== 'running');
  const success = finished.length ? Math.round((finished.filter((r) => r.status === 'succeeded').length / finished.length) * 100) : null;
  const needle = q?.trim().toLowerCase() ?? '';
  const list = needle ? chains.data.filter((c) => `${c.name} ${c.description ?? ''} ${c.tone ?? ''}`.toLowerCase().includes(needle)) : chains.data;

  return (
    <Shell active="/" email={user.email ?? ''}>
      <div className="pagehead">
        <div><h1>Prompt chains</h1><p>Each chain passes its input through ordered steps. A step can read the original input and any earlier step&apos;s output, and can write text or generate an image.</p></div>
        <Link className="btn primary" href="/chains/new"><Icon.plus />New chain</Link>
      </div>
      {status && STATUS[status] && <p className="notice ok" role="status" style={{ marginBottom: 20 }}>{STATUS[status]}</p>}
      <section className="stats" aria-label="Totals">
        <div className="stat"><small>Chains</small><strong>{chains.data.length}</strong></div>
        <div className="stat"><small>Test runs</small><strong>{allRuns.length}</strong></div>
        <div className="stat"><small>Images generated</small><strong>{images.count ?? 0}</strong></div>
        <div className="stat"><small>Run success</small><strong>{success == null ? '—' : `${success}%`}</strong></div>
      </section>
      <form className="filters" method="get" role="search">
        <label className="sr-only" htmlFor="q">Search chains</label>
        <input id="q" type="search" name="q" defaultValue={q ?? ''} placeholder="Search by name, description or tone" style={{ maxWidth: 360 }} />
        <button className="btn sm">Search</button>
        {needle && <Link className="btn sm ghost" href="/">Clear</Link>}
      </form>
      {list.length === 0 ? (
        needle ? <div className="empty"><h2>No matches</h2><p>No chain matches “{q}”.</p></div>
          : <div className="empty"><h2>No chains yet</h2><p>Create one from scratch, start from the caption starter, or import an exported chain.</p><Link className="btn primary" href="/chains/new">Create your first chain</Link></div>
      ) : (
        <div className="chains">
          {list.map((chain) => {
            const cs = stepsBy.get(chain.id) ?? [];
            const cr = runsBy.get(chain.id) ?? [];
            const published = captionsBy.get(chain.id)?.length ?? 0;
            return (
              <Link key={chain.id} href={`/chains/${chain.id}`} className="card chaincard" style={chain.is_active ? undefined : { opacity: 0.7 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h2>{chain.name}</h2>
                  <div className="row" style={{ gap: 6 }}>
                    {chain.tone && <span className="badge accent" title="Linked to this rating-app tone">{chain.tone}</span>}
                    {!chain.is_active && <span className="badge">Inactive</span>}
                  </div>
                </div>
                {chain.description && <p>{chain.description}</p>}
                {cs.length ? (
                  <div className="pipeline" aria-label={`${cs.length} steps`}>
                    {cs.slice(0, 5).map((s, i) => (
                      <span key={s.step_order} style={{ display: 'contents' }}>
                        {i > 0 && <i aria-hidden="true">→</i>}
                        <span className={s.output_type === 'image' ? 'img' : ''} title={s.title}>{s.step_order}. {s.title}</span>
                      </span>
                    ))}
                    {cs.length > 5 && <i>+{cs.length - 5} more</i>}
                  </div>
                ) : <span className="badge run" style={{ alignSelf: 'flex-start' }}>No steps yet</span>}
                <div className="meta">
                  <span>{chain.input_type === 'image' ? 'Image input' : chain.input_type === 'text' ? 'Text input' : 'No input'}</span>
                  <span>{cs.length} step{cs.length === 1 ? '' : 's'}</span>
                  <span>{cr.length} run{cr.length === 1 ? '' : 's'}</span>
                  {published > 0 && <span>{published} published caption{published === 1 ? '' : 's'}</span>}
                  <span>Last run {ago(cr[0]?.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

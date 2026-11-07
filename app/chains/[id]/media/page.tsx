import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/shell';
import { CaptionGrid, MediaGrid, Pager, RUN_SELECT, PAGE_SIZE, signRuns, type RunWithSteps } from '@/components/media-grid';
import { requireAdmin } from '@/lib/admin';
import { loadChainCaptions } from '@/lib/captions';
import type { Chain } from '@/lib/types';

export const dynamic = 'force-dynamic';
const FILTERS = ['all', 'succeeded', 'failed'] as const;

export default async function ChainMedia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; status?: string; show?: string; source?: string }> }) {
  const { supabase, user } = await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const show = (FILTERS as readonly string[]).includes(sp.show ?? '') ? sp.show! : 'all';
  const { data: chain } = await supabase.from('prompt_chains').select('*').eq('id', id).maybeSingle<Chain>();
  if (!chain) notFound();
  let query = supabase.from('prompt_chain_runs').select(RUN_SELECT, { count: 'exact' }).eq('prompt_chain_id', id);
  if (show !== 'all') query = query.eq('status', show);
  const [{ data, count }, published] = await Promise.all([
    query.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<RunWithSteps[]>(),
    loadChainCaptions(supabase, id),
  ]);
  const runs = data ?? [];
  const urls = await signRuns(supabase, runs);
  const source = sp.source === 'rating-app' ? 'rating-app' : 'runs';
  const base = `/chains/${id}/media${show !== 'all' ? `?show=${show}` : ''}`;

  return (
    <Shell active="/" email={user.email ?? ''}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Chains</Link><span>/</span><Link href={`/chains/${id}`}>{chain.name}</Link><span>/</span><span>Media</span></nav>
      <div className="pagehead"><div><h1>{chain.name}</h1><p>Everything this chain has produced, newest first. Test runs show every step&apos;s exact prompt and output.</p></div></div>
      <nav className="tabs" aria-label="Chain sections">
        <Link href={`/chains/${id}`}>Steps &amp; run</Link>
        <Link href={`/chains/${id}/media`} aria-current="page">Generated media</Link>
      </nav>
      {sp.status === 'run-deleted' && <p className="notice ok" role="status" style={{ marginBottom: 18 }}>Run deleted.</p>}
      <div className="filters" role="group" aria-label="Source">
        <Link className={`btn sm${source === 'runs' ? ' primary' : ''}`} href={`/chains/${id}/media`} aria-current={source === 'runs' ? 'true' : undefined}>Test runs ({count ?? 0})</Link>
        <Link className={`btn sm${source === 'rating-app' ? ' primary' : ''}`} href={`/chains/${id}/media?source=rating-app`} aria-current={source === 'rating-app' ? 'true' : undefined}>Published in the rating app ({published.count})</Link>
      </div>
      {source === 'runs' ? (
        <>
          <div className="filters" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => <Link key={f} className={`btn sm${show === f ? '' : ' ghost'}`} href={`/chains/${id}/media${f === 'all' ? '' : `?show=${f}`}`} aria-current={show === f ? 'true' : undefined}>{f[0].toUpperCase() + f.slice(1)}</Link>)}
          </div>
          {runs.length ? <MediaGrid runs={runs} urls={urls} /> : <div className="empty"><h2>No test runs{show !== 'all' ? ` with status “${show}”` : ''}</h2><p>Run the chain to generate media.</p><Link className="btn primary" href={`/chains/${id}`}>Go to the run panel</Link></div>}
          <Pager page={page} hasMore={(count ?? 0) > page * PAGE_SIZE} base={base} />
        </>
      ) : published.captions.length ? (
        <>
          <p className="muted small">Captions members generated in the rating app with this chain&apos;s tone, from the response log. Showing the latest {published.captions.length}.</p>
          <CaptionGrid rows={published.captions} />
        </>
      ) : <div className="empty"><h2>No published captions</h2><p>{chain.tone ? `No ${chain.tone} captions have been logged yet.` : 'Only chains linked to a rating-app tone receive published captions. Link a tone under Chain details.'}</p></div>}
    </Shell>
  );
}

import Link from 'next/link';
import { Shell } from '@/components/shell';
import { MediaGrid, Pager, RUN_SELECT, PAGE_SIZE, signRuns, type RunWithSteps } from '@/components/media-grid';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Generated media' };

export default async function AllMedia({ searchParams }: { searchParams: Promise<{ page?: string; chain?: string }> }) {
  const { supabase, user } = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const chainId = Number(sp.chain) || null;
  const { data: chains } = await supabase.from('prompt_chains').select('id,name').order('name');
  let query = supabase.from('prompt_chain_runs').select(RUN_SELECT, { count: 'exact' });
  if (chainId) query = query.eq('prompt_chain_id', chainId);
  const { data, count } = await query.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<RunWithSteps[]>();
  const runs = data ?? [];
  const urls = await signRuns(supabase, runs);

  return (
    <Shell active="/media" email={user.email ?? ''}>
      <div className="pagehead"><div><h1>Generated media</h1><p>Outputs from every chain run. Images are stored privately and shown through short-lived links.</p></div></div>
      <form className="filters" method="get">
        <label className="sr-only" htmlFor="chain">Chain</label>
        <select id="chain" name="chain" defaultValue={chainId ?? ''}>
          <option value="">All chains</option>
          {(chains ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn sm">Filter</button>
        <span className="muted small">{count ?? 0} run{count === 1 ? '' : 's'}</span>
      </form>
      {runs.length ? <MediaGrid runs={runs} urls={urls} showChain /> : <div className="empty"><h2>No media yet</h2><p>Run a chain to see its outputs here.</p><Link className="btn primary" href="/">Go to chains</Link></div>}
      <Pager page={page} hasMore={(count ?? 0) > page * PAGE_SIZE} base={chainId ? `/media?chain=${chainId}` : '/media'} />
    </Shell>
  );
}

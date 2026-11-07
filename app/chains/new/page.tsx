import Link from 'next/link';
import { Shell } from '@/components/shell';
import { NewChainForm } from '@/components/chain-forms';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New chain' };

export default async function NewChain() {
  const { user } = await requireAdmin();
  return (
    <Shell active="/" email={user.email ?? ''}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Chains</Link><span>/</span><span>New</span></nav>
      <div className="pagehead"><div><h1>New prompt chain</h1><p>Name the chain and choose what it starts from. You&apos;ll add and arrange steps next.</p></div></div>
      <div style={{ maxWidth: 720 }}><NewChainForm /></div>
    </Shell>
  );
}

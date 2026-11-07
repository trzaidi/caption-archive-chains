import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="auth"><section className="authcard"><div className="card">
      <h1>Not found</h1>
      <p className="muted">That chain or run doesn&apos;t exist, or it was deleted.</p>
      <Link className="btn primary" href="/">Back to chains</Link>
    </div></section></main>
  );
}

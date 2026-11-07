'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="auth"><section className="authcard"><div className="card">
      <h1>Something went wrong</h1>
      <p className="muted">The page could not load. Your chains are unaffected.</p>
      <button className="btn primary" onClick={reset}>Try again</button>
    </div></section></main>
  );
}

import { logout } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Not authorized' };

export default function Denied() {
  return (
    <main className="auth">
      <section className="authcard">
        <div className="card">
          <img src="/icon.svg" alt="" />
          <h1>Not authorized</h1>
          <p className="muted">This Google account is signed in but is not a Caption Archive superadmin. Sign out and choose another account.</p>
          <form action={logout}><button className="btn primary google">Sign out</button></form>
        </div>
      </section>
    </main>
  );
}

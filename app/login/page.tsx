import { login } from '@/app/actions';
import { ThemeSwitch } from '@/components/theme-switch';

export const metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth">
      <section className="authcard">
        <div className="card">
          <img src="/icon.svg" alt="" />
          <h1>Prompt Chains</h1>
          <p className="muted">Build, reorder and run multi-step prompt chains for the Caption Archive. Restricted to superadmins.</p>
          {error && <p className="notice error" role="alert">Google sign-in could not be completed. Please try again.</p>}
          <form action={login}><button className="btn primary google">Continue with Google</button></form>
          <p className="muted small">Your account must have superadmin access in the Caption Archive.</p>
          <ThemeSwitch />
        </div>
      </section>
    </main>
  );
}

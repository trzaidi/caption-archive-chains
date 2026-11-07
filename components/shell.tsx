import Link from 'next/link';
import { logout } from '@/app/actions';
import { Icon } from './icons';
import { ThemeSwitch } from './theme-switch';

const NAV = [
  { href: '/', label: 'Chains', icon: Icon.chains },
  { href: '/media', label: 'Generated media', icon: Icon.media },
];

export function Shell({ children, active, email }: { children: React.ReactNode; active: '/' | '/media'; email: string }) {
  return (
    <div className="app">
      <a className="skiplink" href="#main">Skip to content</a>
      <aside className="sidebar">
        <Link href="/" className="brand"><img src="/icon.svg" alt="" /><div><b>Prompt Chains</b><small>Caption Archive</small></div></Link>
        <nav className="nav" aria-label="Main">
          {NAV.map(({ href, label, icon: I }) => (
            <Link key={href} href={href} aria-current={active === href ? 'page' : undefined}><I /><span>{label}</span></Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <ThemeSwitch />
          <div className="who">Signed in as<br />{email}</div>
          <form action={logout}><button className="linkbtn">Sign out</button></form>
        </div>
      </aside>
      <div className="content"><main id="main">{children}</main></div>
    </div>
  );
}

import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { default: 'Prompt Chains | Caption Archive', template: '%s | Prompt Chains' },
  description: 'Build, reorder and run multi-step prompt chains for the Caption Archive.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f6f4ef' }, { media: '(prefers-color-scheme: dark)', color: '#0e1113' }],
};

// Applied before first paint so a saved light/dark choice never flashes the other theme.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}

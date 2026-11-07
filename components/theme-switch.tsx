'use client';
import { useEffect, useState } from 'react';
import { Icon } from './icons';

type Mode = 'light' | 'dark' | 'system';
const OPTIONS: { mode: Mode; label: string; icon: () => React.ReactElement }[] = [
  { mode: 'light', label: 'Light', icon: Icon.sun },
  { mode: 'dark', label: 'Dark', icon: Icon.moon },
  { mode: 'system', label: 'System', icon: Icon.system },
];

export function ThemeSwitch() {
  const [mode, setMode] = useState<Mode>('system');
  useEffect(() => {
    try { const saved = localStorage.getItem('theme'); if (saved === 'light' || saved === 'dark') setMode(saved); } catch {}
  }, []);
  function choose(next: Mode) {
    setMode(next);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme; else root.dataset.theme = next;
    try { if (next === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', next); } catch {}
  }
  return (
    <div className="theme" role="group" aria-label="Color theme">
      {OPTIONS.map(({ mode: m, label, icon: I }) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => choose(m)} title={`${label} theme`}>
          <I /><span>{label}</span>
        </button>
      ))}
    </div>
  );
}

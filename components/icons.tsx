// Minimal inline icon set (stroke icons, 24px grid).
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const Icon = {
  chains: () => <svg {...base}><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.9 7.6-3.8M8.2 13.1l7.6 3.8"/></svg>,
  media: () => <svg {...base}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/></svg>,
  plus: () => <svg {...base}><path d="M12 5v14M5 12h14"/></svg>,
  up: () => <svg {...base}><path d="m6 15 6-6 6 6"/></svg>,
  down: () => <svg {...base}><path d="m6 9 6 6 6-6"/></svg>,
  grip: () => <svg {...base}><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>,
  trash: () => <svg {...base}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>,
  play: () => <svg {...base}><path d="m7 5 12 7-12 7z"/></svg>,
  copy: () => <svg {...base}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>,
  download: () => <svg {...base}><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>,
  sun: () => <svg {...base}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
  moon: () => <svg {...base}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>,
  system: () => <svg {...base}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>,
  image: () => <svg {...base}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/></svg>,
  text: () => <svg {...base}><path d="M5 6h14M5 12h14M5 18h9"/></svg>,
};

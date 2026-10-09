import type { ReactNode } from 'react';
const P: Record<string, ReactNode> = {
  lion: <><circle cx="12" cy="13" r="5"/><path d="M12 8V4M7 9 4 6M17 9l3-3M5 13H2M19 13h3M7 17l-3 3M17 17l3 3"/><path d="M10 12h.01M14 12h.01M11 15h2"/></>,
  raven: <path d="M3 18c4 0 7-2 9-6 1-2 3-4 6-4l3 1-3 2c0 5-4 9-10 9H3zM15 8l2-4"/>,
  sword: <path d="M14 3h7v7L10 21l-3-3L18 7zM6 14l4 4M4 20l3-3"/>,
  oak: <><path d="M12 21v-7M12 17l-4-3M12 15l4-3"/><path d="M12 3c-4 0-7 2-7 6s3 6 7 6 7-2 7-6-3-6-7-6z"/></>,
  flame: <path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 1 2 2 3 1 0-2 0-3 0-5z"/>,
  moon: <path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>,
};
export function GuildInsignia({ emblem, size = 26 }: { emblem: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={`${emblem} emblem`}>{P[emblem] ?? <circle cx="12" cy="12" r="7"/>}</svg>;
}

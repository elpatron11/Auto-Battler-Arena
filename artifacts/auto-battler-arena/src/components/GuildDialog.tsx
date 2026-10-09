import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';

export function GuildDialog({ label, testId, onClose, children, wide }: { label: string; testId: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const card = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = card.current;
    (el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, []);
  return <div className="gx-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} data-testid={testId} className="gx-modal-card" style={wide ? { width: 'min(100%,580px)', maxHeight: '88dvh', overflow: 'auto' } : undefined}>{children}</div>
  </div>;
}

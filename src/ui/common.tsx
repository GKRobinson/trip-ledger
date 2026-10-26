import { useEffect, useState, type ReactNode } from 'react';

export function Header({
  title,
  sub,
  onBack,
  right,
}: {
  title: string;
  sub?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="top">
      {onBack && (
        <button className="back" onClick={onBack} aria-label="Back">
          ‹
        </button>
      )}
      <div className="titles">
        <h1>{title}</h1>
        {sub && <div className="hsub">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

/** A button that asks for a second tap within a few seconds before acting. */
export function ConfirmButton({
  label,
  confirmLabel = 'Tap again to confirm',
  onConfirm,
  className = 'ghost red',
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={className + (armed ? ' armed' : '')}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function Problems({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="problems">
      {items.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="warnings">
      {items.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

import type { ReactNode } from "react";

export function Cta({
  children,
  href,
  className = "",
}: {
  children: ReactNode;
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 ${className}`}
    >
      {children}
    </a>
  );
}

export function CtaGhost({
  children,
  href,
  className = "",
}: {
  children: ReactNode;
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface-elevated/70 px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-signal/40 hover:bg-signal-soft ${className}`}
    >
      {children}
    </a>
  );
}

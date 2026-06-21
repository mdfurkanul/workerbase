import type { ReactNode } from "react";

interface AuthLayoutProps {
  label: string;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Minimal auth shell — centered card on a flat canvas. No split-screen,
 * no atmospheric panels. Just the form.
 */
export default function AuthLayout({ label, title, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-bg">
      <div className="w-full max-w-sm">
        <div className="rise" style={{ ["--i" as string]: 0 }}>
          <Brand />
        </div>

        <div className="mt-10 rise" style={{ ["--i" as string]: 1 }}>
          <span className="label-mono">{label}</span>
          <h1 className="font-display text-3xl mt-2 leading-tight">{title}</h1>
        </div>

        <div className="mt-8 rise" style={{ ["--i" as string]: 2 }}>{children}</div>

        {footer && (
          <div className="mt-8 rise" style={{ ["--i" as string]: 3 }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-brand text-lg leading-none">◆</span>
      <span className="font-display italic text-xl">Workerbase</span>
    </div>
  );
}

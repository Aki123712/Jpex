import { useEffect, useState, type ReactNode } from "react";

export function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      fallback ?? (
        <div className="flex h-full min-h-[12rem] items-center justify-center text-xs text-subtle">
          图表加载中…
        </div>
      )
    );
  }
  return <>{children}</>;
}

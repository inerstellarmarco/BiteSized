"use client";

import { useEffect, useId, useState } from "react";

export function Diagram({ source }: { source: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "neutral",
          fontFamily: "inherit",
        });
        const { svg: markup } = await mermaid.render(`diagram${reactId}`, source);
        if (!cancelled) setSvg(markup);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reactId, source]);

  if (failed) {
    return (
      <div data-testid="diagram-fallback" className="rounded-xl border border-dashed border-border bg-secondary/60 p-4 text-sm">
        <p className="font-medium">This diagram could not be drawn.</p>
        <p className="mt-1 text-muted-foreground">The source is still here, so the idea is not lost.</p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed">{source}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="diagram-loading">
        Drawing the diagram…
      </p>
    );
  }

  return <div data-testid="diagram" className="diagram-frame overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}

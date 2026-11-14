"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="font-display text-3xl">Something went wrong.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page could not be loaded (for example, while the database is waking up or finishing an import). Your progress is still in the database.
      </p>
      {error?.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/home">Go to Home</Link>
        </Button>
      </div>
    </div>
  );
}

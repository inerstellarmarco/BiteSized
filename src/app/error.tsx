"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="font-display text-3xl italic leading-none">Bite Sized</p>
      <h1 className="mt-3 font-display text-2xl">Something went wrong.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The server took too long or hit a temporary error while waking up. Your progress is safe in the database.
      </p>
      {error?.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Sign-in page</Link>
        </Button>
      </div>
    </main>
  );
}

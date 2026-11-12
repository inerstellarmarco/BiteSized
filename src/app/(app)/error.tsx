"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="font-display text-3xl">Something went wrong.</h1>
      <p className="mt-2 text-sm text-muted-foreground">The page could not be loaded. Your progress is still in the database.</p>
      <Button className="mt-4" type="button" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}

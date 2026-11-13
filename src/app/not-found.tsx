import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="font-display text-3xl md:text-4xl">That page is not in the course.</h1>
      <p className="mt-2 text-muted-foreground">It may have been archived, or the link is old.</p>
      <Link href="/course" className="mt-4 underline decoration-primary/50 underline-offset-4">
        Back to the course
      </Link>
    </main>
  );
}

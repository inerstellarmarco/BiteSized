"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "2.5rem 1rem", background: "#f3ecdf", color: "#1d1a16" }}>
        <main style={{ maxWidth: "28rem", margin: "0 auto" }}>
          <p style={{ fontSize: "1.75rem", fontStyle: "italic", margin: 0 }}>Bite Sized</p>
          <h1 style={{ fontSize: "1.5rem", marginTop: "0.75rem" }}>Something went wrong.</h1>
          <p style={{ fontSize: "0.95rem", lineHeight: 1.5, opacity: 0.85 }}>
            The page could not be loaded right now (for example, while the database is waking up or finishing a course import). Your progress is safe.
          </p>
          {error?.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: "0.75rem", opacity: 0.7 }}>Reference: {error.digest}</p>
          ) : null}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "0.6rem 1.1rem",
                borderRadius: "0.75rem",
                border: "none",
                background: "#9e3b24",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: "0.6rem 1.1rem",
                borderRadius: "0.75rem",
                border: "1px solid rgba(0,0,0,0.2)",
                color: "inherit",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Reload app
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}

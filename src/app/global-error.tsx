"use client";

import "./globals.css";

/**
 * Last resort, used when the root layout itself fails. It replaces the whole document, so it cannot rely on the app
 * shell: plain markup styled with the design tokens (neutral surface, one yellow primary action, dark text on yellow).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-lg font-semibold">The tool could not start</h1>
          <p className="text-sm text-muted-foreground">Something went wrong while loading. Your saved data is safe. Reload to try again.</p>
          {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            className="mt-2 inline-flex min-h-11 items-center rounded-md border border-accent-strong bg-accent px-4 text-sm font-medium text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}

"use client";

import React from "react";

export default function Page() {
  return (
    <main className="min-h-screen p-6 flex items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-soft p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">Web V2 is running</h1>
        <p className="text-[var(--muted-foreground)]">
          Tailwind tokens loaded. Proceed with File Manager shell wiring in subsequent PRs.
        </p>
      </div>
    </main>
  );
}

import React from "react";

export default function FilesPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)]">
        <h1 className="text-xl font-semibold">Files</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Visual refresh workbench – routing stub for /files
        </p>
      </header>

      <section className="p-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-soft p-6">
          <p className="text-[var(--muted-foreground)]">
            This is a temporary page to avoid 404s on /files while we wire the File Browser shell.
          </p>
          <ul className="list-disc ml-6 mt-3 text-sm text-[var(--muted-foreground)]">
            <li>StatusBar PR (#1) ready for review.</li>
            <li>Sidebar/Search/Breadcrumb/Toolbar to follow in PR #2.</li>
            <li>File rows/cards in PR #3, Details + Ask-AI in PR #4.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
'use client';

import React from 'react';
import ModeToggles from '@/components/dev/ModeToggles';

export default function ModesDevPage() {
  return (
    <main
      data-testid="dev-modes-page"
      className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]"
    >
      <div className="max-w-5xl mx-auto py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Modes Verification</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Toggle advanced modes for visual verification: Dark mode, Density (compact), High-contrast, Text-zoom, and Reduced-motion.
          </p>
        </div>
        <ModeToggles />
      </div>
    </main>
  );
}
import type { NextConfig } from 'next'
import path from 'path'

/**
 * Next.js 15 configuration for apps/web-v2
 *
 * - outputFileTracingRoot: force the monorepo root (/root/dev/aifile2) to avoid
 *   incorrect root inference when multiple lockfiles exist (fixes dev resolving
 *   internal modules like "private-next-instrumentation-client").
 * - eslint.ignoreDuringBuilds: keeps builds unblocked until repo ESLint config is aligned with Next 15.
 * - typescript.ignoreBuildErrors: keep strict by default; flip to true only if needed.
 * - allowedDevOrigins: silence cross-origin warnings when accessing dev server via network IP.
 */
const config: NextConfig & { allowedDevOrigins?: string[] } = {
  // IMPORTANT: set to the repository root (apps/web-v2/../.. => /root/dev/aifile2)
  outputFileTracingRoot: path.resolve(__dirname, '../..'),

  eslint: {
    // Silence Next 15 lint runner while we align root ESLint config to new options (extensions was removed)
    ignoreDuringBuilds: true,
  },

  // Keep TS checks on; switch to true temporarily if needed to unblock CI
  typescript: {
    ignoreBuildErrors: false,
  },

  /**
   * Dev-only: explicitly allow network access to the Next.js dev server for assets.
   * This addresses the warning:
   * "Cross origin request detected ... configure allowedDevOrigins in next.config"
   */
  allowedDevOrigins: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    // Network IP for remote access to dev server:
    'http://195.201.90.99:3001',
  ],
}

export default config

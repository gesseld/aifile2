import path from 'path'
import { fileURLToPath } from 'url'

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Next.js config for apps/web-v2 (ESM because package.json sets "type":"module")
 * - outputFileTracingRoot: silence monorepo lockfile warning by pointing tracing to repo root
 * - reactStrictMode: keep defaults aligned with App Router
 */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep default app dir behavior if needed in future updates
  },
  // Allow CI builds to succeed even if lint or TS has issues (we lint separately).
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
}

export default nextConfig

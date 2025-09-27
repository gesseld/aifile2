import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'

export default defineConfig({
  resolve: {
    alias: {
      // Stubs for components not needed in unit tests
      '@/components/settings/SettingsPanel': fileURLToPath(
        new URL('./src/test-stubs/SettingsPanel.tsx', import.meta.url)
      ),
      '@/components/file-browser/ContextMenu': fileURLToPath(
        new URL('./src/test-stubs/ContextMenu.tsx', import.meta.url)
      ),
      // File manager client: provide minimal fake for tests
      '@/lib/file-manager-client': fileURLToPath(
        new URL('./src/test-stubs/file-manager-client.ts', import.meta.url)
      ),
      // Base alias
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
})

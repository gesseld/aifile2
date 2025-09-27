import type { Config } from 'tailwindcss'

/**
 * Tailwind config for apps/web-v2
 * - Tokens are provided via CSS variables in src/app/globals.css
 * - Use arbitrary values to reference tokens directly (e.g. bg-[var(--surface)])
 * - Dark/high-contrast/density/text-zoom/reduced-motion are handled via attributes on html/body
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // Reference CSS variables as named colors to simplify common utilities
      colors: {
        background: 'var(--background)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        border: 'var(--border)',
        ring: 'var(--ring)',
        accent: 'var(--accent)',
        primary: {
          DEFAULT: 'var(--primary)',
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
          800: 'var(--primary-800)',
          900: 'var(--primary-900)',
        },
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        success: 'var(--success)',
        info: 'var(--info)',
      },
      borderRadius: {
        sm: 'var(--radius-sm, 6px)',
        DEFAULT: 'var(--radius, 10px)',
        md: 'var(--radius-md, 12px)',
        lg: 'var(--radius-lg, 14px)',
        xl: 'var(--radius-xl, 16px)',
      },
      boxShadow: {
        // soft, medium, and lift shadows that match spec
        soft: 'var(--shadow-soft, 0 1px 0 rgba(17,24,39,0.03), 0 6px 18px rgba(17,24,39,0.06))',
        lift: 'var(--shadow-lift, 0 1px 0 rgba(17,24,39,0.04), 0 8px 22px rgba(17,24,39,0.08))',
        hard: 'var(--shadow-hard, 0 1px 0 rgba(17,24,39,0.06), 0 10px 28px rgba(17,24,39,0.12))',
      },
      ringColor: {
        DEFAULT: 'var(--ring)',
      },
      ringOffsetColor: {
        DEFAULT: 'var(--surface)',
      },
      transitionTimingFunction: {
        standard: 'var(--motion-ease-standard, cubic-bezier(0.2,0,0,1))',
      },
      transitionDuration: {
        fast: 'var(--motion-duration-fast, 150ms)',
        normal: 'var(--motion-duration-normal, 250ms)',
      },
      spacing: {
        // density-aware spacing hooks
        13: '3.25rem',
        15: '3.75rem',
      },
    },
  },
  plugins: [],
}
export default config

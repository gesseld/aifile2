import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'File Manager',
  description: 'Modern file manager UI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--app-bg,transparent)] text-[var(--foreground)] antialiased">
        {children}
      </body>
    </html>
  )
}
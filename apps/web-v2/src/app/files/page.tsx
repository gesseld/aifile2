import React from 'react'
import FileBrowserShell from '@/components/file-browser/FileBrowserShell'

export const metadata = {
  title: 'Files',
  description: 'File Manager',
}

export default function FilesPage() {
  return (
    <main data-testid="files-page" className="h-[100dvh] w-full overflow-hidden">
      <FileBrowserShell />
    </main>
  )
}
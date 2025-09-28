import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FileDetailsPanel from '@/components/file-browser/FileDetailsPanel'
import * as AiAdapter from '@/lib/ai-adapter'

// Mock next/navigation useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock AI adapter selectively
const askAISpy = vi.spyOn(AiAdapter, 'askAI')

// Minimal fake file
const fakeFile = {
  id: 'file-1',
  name: 'example.txt',
  bucket: 'demo-bucket',
  key: 'path/example.txt',
  mime_type: 'text/plain',
  size_bytes: 2048,
  tags: { owner: 'alice' },
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  version_id: 'v1',
  checksum: 'abc123',
} as any

describe('FileDetailsPanel Ask-AI flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Ask-AI input and submit and populates AI sections on success', async () => {
    askAISpy.mockResolvedValueOnce({
      summary: 'This is a concise summary.',
      text: 'This is a concise summary.',
      tags: { project: 'apollo', priority: 'high' },
      entities: [{ type: 'ORG', value: 'ACME', score: 0.92 }],
      raw: { ok: true },
    } as AiAdapter.AskAiResponse)

    render(<FileDetailsPanel file={fakeFile} />)

    const input = screen.getByTestId('ask-ai-input') as HTMLInputElement
    const submit = screen.getByTestId('ask-ai-submit') as HTMLButtonElement

    expect(input).toBeInTheDocument()
    expect(submit).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'Summarize and suggest tags' } })
    fireEvent.click(submit)

    await waitFor(() => {
      // Summary section shows
      expect(screen.getByText('AI Summary')).toBeInTheDocument()
      expect(screen.getByText('This is a concise summary.')).toBeInTheDocument()
      // Suggested Tags buttons appear
      expect(
        screen.getByRole('button', { name: /project:\s*apollo/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /priority:\s*high/i })
      ).toBeInTheDocument()
      // Entities rendered
      expect(screen.getByText(/ORG/i)).toBeInTheDocument()
      expect(screen.getByText(/ACME/i)).toBeInTheDocument()
    })
  })

  it('adds a suggested tag to the editable tags list when clicked', async () => {
    askAISpy.mockResolvedValueOnce({
      text: 'Summary\nTags: team=eng, risk=low',
      summary: 'Summary',
      tags: { team: 'eng' },
      entities: [],
      raw: {},
    })

    render(<FileDetailsPanel file={fakeFile} />)

    const input = screen.getByTestId('ask-ai-input') as HTMLInputElement
    const submit = screen.getByTestId('ask-ai-submit') as HTMLButtonElement
    fireEvent.change(input, { target: { value: 'Suggest tags' } })
    fireEvent.click(submit)

    // Wait until suggested tag chips appear
    const chip = await screen.findByRole('button', { name: /team:\s*eng/i })
    fireEvent.click(chip)

    // Now the tag inputs should include the added tag key/value
    await waitFor(() => {
      const keyInputs = screen.getAllByPlaceholderText(
        /key/i
      ) as HTMLInputElement[]
      const valInputs = screen.getAllByPlaceholderText(
        /value/i
      ) as HTMLInputElement[]
      // Ensure one of the rows contains the team=eng pair
      const hasTeamKey = keyInputs.some((i) => i.value === 'team')
      const hasEngVal = valInputs.some((i) => i.value === 'eng')
      expect(hasTeamKey && hasEngVal).toBe(true)
    })
  })

  it('shows error when Ask-AI fails', async () => {
    askAISpy.mockRejectedValueOnce(new Error('Service unavailable'))
    render(<FileDetailsPanel file={fakeFile} />)
    const input = screen.getByTestId('ask-ai-input') as HTMLInputElement
    const submit = screen.getByTestId('ask-ai-submit') as HTMLButtonElement
    fireEvent.change(input, { target: { value: 'Summarize' } })
    fireEvent.click(submit)

    await waitFor(() => {
      expect(screen.getByText(/Ask-AI failed/i)).toBeInTheDocument()
      expect(screen.getByText(/Service unavailable/i)).toBeInTheDocument()
    })
  })
})

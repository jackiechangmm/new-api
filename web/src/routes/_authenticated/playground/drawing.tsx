import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { z } from 'zod'

import { Drawing } from '@/features/drawing'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

const drawingSearchSchema = z.object({
  prompt: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/playground/drawing')({
  beforeLoad: () => {
    if (!isSidebarModuleEnabled('chat', 'drawing')) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: DrawingPage,
  validateSearch: drawingSearchSchema,
})

function DrawingPage() {
  const { prompt } = Route.useSearch()
  const navigate = Route.useNavigate()

  useEffect(() => {
    if (!prompt) return
    void navigate({ replace: true, search: {}, to: '/playground/drawing' })
  }, [navigate, prompt])

  return <Drawing initialPrompt={prompt} />
}

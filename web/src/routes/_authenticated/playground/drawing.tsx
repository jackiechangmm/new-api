import { createFileRoute, redirect } from '@tanstack/react-router'

import { Drawing } from '@/features/drawing'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

export const Route = createFileRoute('/_authenticated/playground/drawing')({
  beforeLoad: () => {
    if (!isSidebarModuleEnabled('chat', 'drawing')) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: DrawingPage,
})

function DrawingPage() {
  return <Drawing />
}

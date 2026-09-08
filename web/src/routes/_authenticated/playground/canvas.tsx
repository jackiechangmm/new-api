import { useEffect } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/playground/canvas')({
  beforeLoad: async () => {
    if (!isCanvasEnabled()) throw redirect({ to: '/dashboard' })
  },
  component: CanvasPage,
})

function isCanvasEnabled() {
  return true
}

function CanvasPage() {
  const auth = useAuthStore((state) => state.auth)

  useEffect(() => {
    const host = window as Window & { newApiCanvasHost?: { getAuthHeaders: () => Record<string, string> } }
    host.newApiCanvasHost = {
      getAuthHeaders: () => auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
    }
    return () => {
      delete host.newApiCanvasHost
    }
  }, [auth.accessToken])

  return (
    <iframe
      title='Infinite Canvas'
      src='/canvas/'
      className='h-full w-full border-0'
      loading='eager'
    />
  )
}

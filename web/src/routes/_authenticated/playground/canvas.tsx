import { createFileRoute, redirect } from '@tanstack/react-router'

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
  return (
    <iframe
      title='Infinite Canvas'
      src='/canvas/'
      className='h-full w-full border-0'
      loading='eager'
    />
  )
}

import { createFileRoute, redirect } from '@tanstack/react-router'

import { EcommerceDrawing } from '@/features/ecommerce-drawing'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

export const Route = createFileRoute(
  '/_authenticated/playground/ecommerce-drawing'
)({
  beforeLoad: () => {
    if (!isSidebarModuleEnabled('chat', 'ecommerceDrawing')) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: EcommerceDrawing,
})

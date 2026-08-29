/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

import { WatermarkRemoval } from '@/features/watermark-removal'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

export const Route = createFileRoute(
  '/_authenticated/playground/watermark-removal'
)({
  beforeLoad: () => {
    if (!isSidebarModuleEnabled('chat', 'watermarkRemoval')) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: WatermarkRemoval,
})

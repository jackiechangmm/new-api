/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type AssetPaginationProps = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function AssetPagination(props: AssetPaginationProps) {
  const { t } = useTranslation()
  const pageCount = Math.max(1, Math.ceil(props.total / props.pageSize))
  if (props.total <= props.pageSize) return null

  return (
    <nav
      className='flex items-center justify-center gap-3'
      aria-label={t('Pagination')}
    >
      <Button
        type='button'
        variant='outline'
        size='icon'
        disabled={props.page <= 1}
        aria-label={t('Previous page')}
        onClick={() => props.onPageChange(props.page - 1)}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} />
      </Button>
      <span className='text-muted-foreground min-w-20 text-center text-sm tabular-nums'>
        {t('Page {{page}} of {{total}}', {
          page: props.page,
          total: pageCount,
        })}
      </span>
      <Button
        type='button'
        variant='outline'
        size='icon'
        disabled={props.page >= pageCount}
        aria-label={t('Next page')}
        onClick={() => props.onPageChange(props.page + 1)}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} />
      </Button>
    </nav>
  )
}

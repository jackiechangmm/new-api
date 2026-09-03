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
import {
  Copy01Icon,
  Delete02Icon,
  FavouriteIcon,
  PencilEdit01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Paintbrush } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { DigitalAsset } from '../types'

type AssetDetailDialogProps = {
  asset: DigitalAsset | null
  favoritePending: boolean
  onOpenChange: (open: boolean) => void
  onCopy: (asset: DigitalAsset) => void
  onEdit: (asset: DigitalAsset) => void
  onFavorite: (asset: DigitalAsset) => void
  onDraw: (asset: DigitalAsset) => void
  onDelete: (asset: DigitalAsset) => void
}

export function AssetDetailDialog(props: AssetDetailDialogProps) {
  const { t } = useTranslation()
  const asset = props.asset

  return (
    <Dialog
      open={asset !== null}
      onOpenChange={props.onOpenChange}
      title={asset?.title ?? t('Prompt details')}
      contentClassName='sm:max-w-2xl'
      bodyClassName='space-y-4'
      footer={
        asset ? (
          <>
            <Button
              type='button'
              variant='destructive'
              onClick={() => props.onDelete(asset)}
            >
              <HugeiconsIcon icon={Delete02Icon} />
              {t('Delete')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={props.favoritePending}
              onClick={() => props.onFavorite(asset)}
            >
              <HugeiconsIcon
                icon={FavouriteIcon}
                className={asset.is_favorite ? 'fill-current' : undefined}
              />
              {asset.is_favorite
                ? t('Remove from favorites')
                : t('Add to favorites')}
            </Button>
            <Button
              type='button'
              variant='outline'
              onClick={() => props.onEdit(asset)}
            >
              <HugeiconsIcon icon={PencilEdit01Icon} />
              {t('Edit')}
            </Button>
            <Button
              type='button'
              variant='outline'
              onClick={() => props.onDraw(asset)}
            >
              <Paintbrush />
              {t('Go draw')}
            </Button>
            <Button type='button' onClick={() => props.onCopy(asset)}>
              <HugeiconsIcon icon={Copy01Icon} />
              {t('Copy prompt')}
            </Button>
          </>
        ) : null
      }
    >
      {asset ? (
        <div className='space-y-4'>
          <div className='flex flex-wrap gap-1.5'>
            {asset.tags.map((tag) => (
              <Badge key={tag.id} variant='secondary'>
                {tag.name}
              </Badge>
            ))}
          </div>
          <div className='bg-muted/40 max-h-[50vh] overflow-auto rounded-md border p-4'>
            <p className='text-sm leading-6 break-words whitespace-pre-wrap'>
              {asset.content}
            </p>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}

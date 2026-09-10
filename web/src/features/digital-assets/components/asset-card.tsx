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
import { FavouriteIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { DigitalAsset } from '../types'

type DigitalAssetCardProps = {
  asset: DigitalAsset
  favoritePending: boolean
  onOpen: (asset: DigitalAsset) => void
  onFavorite: (asset: DigitalAsset) => void
}

export function DigitalAssetCard(props: DigitalAssetCardProps) {
  const { t } = useTranslation()
  const isImage = props.asset.asset_type === 'image'
  const imageUrl = props.asset.image?.url

  return (
    <Card
      size='sm'
      className={cn(
        'hover:bg-muted/30 relative flex flex-col rounded-lg transition-colors',
        isImage ? 'h-72 overflow-hidden' : 'h-44'
      )}
    >
      <button
        type='button'
        className='focus-visible:ring-ring absolute inset-0 z-0 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:outline-none'
        aria-label={t('Open prompt {{title}}', { title: props.asset.title })}
        onClick={() => props.onOpen(props.asset)}
      />
      {isImage ? (
        <div className='bg-muted pointer-events-none relative h-32 w-full shrink-0 overflow-hidden rounded-t-lg'>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={props.asset.title}
              className='size-full object-cover'
              loading='lazy'
            />
          ) : (
            <div className='text-muted-foreground flex size-full items-center justify-center text-xs'>
              {props.asset.title}
            </div>
          )}
        </div>
      ) : null}
      <CardHeader className='pointer-events-none relative z-1'>
        <CardTitle className='line-clamp-1 pr-1'>{props.asset.title}</CardTitle>
        <CardAction className='pointer-events-auto relative z-2'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            disabled={props.favoritePending}
            aria-label={
              props.asset.is_favorite
                ? t('Remove from favorites')
                : t('Add to favorites')
            }
            onClick={() => props.onFavorite(props.asset)}
          >
            <HugeiconsIcon
              icon={FavouriteIcon}
              className={props.asset.is_favorite ? 'fill-current' : undefined}
            />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='pointer-events-none relative z-1 flex min-h-0 flex-1 flex-col gap-3'>
        <p
          className={cn(
            'text-muted-foreground min-h-0 flex-1 text-left text-sm leading-5 whitespace-pre-wrap',
            isImage ? 'line-clamp-2' : 'line-clamp-3'
          )}
        >
          {props.asset.content}
        </p>
        <div className='flex min-h-5 flex-wrap gap-1 overflow-hidden'>
          {props.asset.tags.slice(0, 4).map((tag) => (
            <Badge key={tag.id} variant='secondary'>
              {tag.name}
            </Badge>
          ))}
          {props.asset.tags.length > 4 ? (
            <Badge variant='outline'>+{props.asset.tags.length - 4}</Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

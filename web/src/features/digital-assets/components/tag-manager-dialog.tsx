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
import { Delete02Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

import type { DigitalAssetTag } from '../types'

type TagManagerDialogProps = {
  open: boolean
  tags: DigitalAssetTag[]
  pending: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (tag: DigitalAssetTag) => void
}

export function TagManagerDialog(props: TagManagerDialogProps) {
  const { t } = useTranslation()
  const [deleteTag, setDeleteTag] = useState<DigitalAssetTag | null>(null)

  useEffect(() => {
    if (deleteTag && !props.tags.some((tag) => tag.id === deleteTag.id)) {
      setDeleteTag(null)
    }
  }, [deleteTag, props.tags])

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('Manage tags')}
        contentClassName='sm:max-w-md'
        bodyClassName='max-h-80 overflow-y-auto'
        footer={
          <Button type='button' onClick={() => props.onOpenChange(false)}>
            {t('Done')}
          </Button>
        }
      >
        {props.tags.length > 0 ? (
          <div className='divide-y'>
            {props.tags.map((tag) => (
              <div key={tag.id} className='flex items-center gap-3 py-2'>
                <span className='min-w-0 flex-1 truncate' title={tag.name}>
                  {tag.name}
                </span>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('Delete tag {{tag}}', { tag: tag.name })}
                  disabled={props.pending}
                  onClick={() => setDeleteTag(tag)}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            {t('No tags yet')}
          </p>
        )}
      </Dialog>

      <AlertDialog
        open={deleteTag !== null}
        onOpenChange={(open) => {
          if (!open && !props.pending) setDeleteTag(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Delete tag “{{tag}}”?', { tag: deleteTag?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This tag will be removed from every asset that uses it, but no assets will be deleted.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.pending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={props.pending || !deleteTag}
              onClick={() => {
                if (deleteTag) props.onDelete(deleteTag)
              }}
            >
              {props.pending ? (
                <HugeiconsIcon icon={Loading03Icon} className='animate-spin' />
              ) : null}
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

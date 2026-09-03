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
import { useTranslation } from 'react-i18next'

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

import type { DigitalAsset } from '../types'

type AssetDeleteDialogProps = {
  asset: DigitalAsset | null
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (asset: DigitalAsset) => void
}

export function AssetDeleteDialog(props: AssetDeleteDialogProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog open={props.asset !== null} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Delete this prompt?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('This action is permanent and cannot be undone.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={props.pending || !props.asset}
            onClick={() => {
              if (props.asset) props.onConfirm(props.asset)
            }}
          >
            {t('Delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

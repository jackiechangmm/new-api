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
import { z } from 'zod'

export const DIGITAL_ASSET_DEFAULT_TAGS = ['角色', '物品', '场景'] as const

export function getDigitalAssetFormSchema(
  t: (key: string) => string,
  isImage = false
) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, t('Title is required'))
      .max(100, t('Title must be 100 characters or fewer')),
    content: isImage
      ? z
          .string()
          .max(100000, t('Content must be 100000 characters or fewer'))
      : z
          .string()
          .max(100000, t('Content must be 100000 characters or fewer'))
          .refine((value) => value.trim().length > 0, t('Content is required')),
    tags: z
      .array(z.string().trim().min(1).max(32))
      .max(20, t('You can add up to 20 tags')),
  })
}

export type DigitalAssetFormValues = z.infer<
  ReturnType<typeof getDigitalAssetFormSchema>
>

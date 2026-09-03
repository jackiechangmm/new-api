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
import { zodResolver } from '@hookform/resolvers/zod'
import { Cancel01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import {
  DIGITAL_ASSET_DEFAULT_TAGS,
  getDigitalAssetFormSchema,
  type DigitalAssetFormValues,
} from '../lib/form'
import type { DigitalAsset, DigitalAssetTag } from '../types'

type AssetFormDialogProps = {
  open: boolean
  asset: DigitalAsset | null
  availableTags: DigitalAssetTag[]
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: DigitalAssetFormValues) => Promise<void>
}

function normalizeTag(name: string): string {
  return name.trim().toLowerCase()
}

export function AssetFormDialog(props: AssetFormDialogProps) {
  const { t } = useTranslation()
  const [tagInput, setTagInput] = useState('')
  const schema = useMemo(() => getDigitalAssetFormSchema(t), [t])
  const form = useForm<DigitalAssetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', content: '', tags: [] },
  })

  useEffect(() => {
    if (!props.open) return
    form.reset({
      title: props.asset?.title ?? '',
      content: props.asset?.content ?? '',
      tags: props.asset?.tags.map((tag) => tag.name) ?? [],
    })
    setTagInput('')
  }, [form, props.asset, props.open])

  const selectedTags = form.watch('tags')
  const suggestions = [
    ...DIGITAL_ASSET_DEFAULT_TAGS,
    ...props.availableTags.map((tag) => tag.name),
  ].filter(
    (name, index, names) =>
      names.findIndex(
        (candidate) => normalizeTag(candidate) === normalizeTag(name)
      ) === index &&
      !selectedTags.some(
        (selected) => normalizeTag(selected) === normalizeTag(name)
      )
  )

  const addTag = (rawName: string) => {
    const name = rawName.trim()
    if (!name) return
    if (name.length > 32) {
      toast.error(t('Tag must be 32 characters or fewer'))
      return
    }
    if (selectedTags.some((tag) => normalizeTag(tag) === normalizeTag(name))) {
      setTagInput('')
      return
    }
    if (selectedTags.length >= 20) {
      toast.error(t('You can add up to 20 tags'))
      return
    }
    form.setValue('tags', [...selectedTags, name], { shouldValidate: true })
    setTagInput('')
  }

  const removeTag = (name: string) => {
    form.setValue(
      'tags',
      selectedTags.filter((tag) => tag !== name),
      { shouldValidate: true }
    )
  }

  const submit = form.handleSubmit(async (values) => {
    try {
      await props.onSubmit(values)
    } catch {
      // mutation 负责展示服务端错误，并保持表单打开。
    }
  })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.asset ? t('Edit prompt') : t('New prompt')}
      description={t('Save a reusable text prompt to your private assets.')}
      contentClassName='sm:max-w-xl'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='digital-asset-form'
            disabled={props.pending}
          >
            {props.pending ? (
              <HugeiconsIcon icon={Loading03Icon} className='animate-spin' />
            ) : null}
            {t('Save')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form id='digital-asset-form' className='space-y-4' onSubmit={submit}>
          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Title')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoFocus
                    maxLength={100}
                    placeholder={t('Give this prompt a clear title')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='content'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Prompt content')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={10}
                    maxLength={100000}
                    className='min-h-52 resize-y'
                    placeholder={t('Enter the complete prompt')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel htmlFor='digital-asset-tag-input'>{t('Tags')}</FormLabel>
            <div className='flex flex-wrap gap-1.5'>
              {selectedTags.map((tag) => (
                <Badge
                  key={normalizeTag(tag)}
                  variant='secondary'
                  className='gap-1'
                >
                  {tag}
                  <button
                    type='button'
                    aria-label={t('Remove tag {{tag}}', { tag })}
                    onClick={() => removeTag(tag)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className='size-3' />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              id='digital-asset-tag-input'
              value={tagInput}
              maxLength={32}
              placeholder={t('Type a tag and press Enter')}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                addTag(tagInput)
              }}
              onBlur={() => addTag(tagInput)}
            />
            {suggestions.length > 0 ? (
              <div
                className='flex flex-wrap gap-1.5'
                aria-label={t('Suggested tags')}
              >
                {suggestions.slice(0, 12).map((tag) => (
                  <Button
                    key={normalizeTag(tag)}
                    type='button'
                    variant='outline'
                    size='xs'
                    onClick={() => addTag(tag)}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            ) : null}
          </FormItem>
        </form>
      </Form>
    </Dialog>
  )
}

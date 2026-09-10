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
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
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
  initialPrompt?: { title: string; content: string }
  availableTags: DigitalAssetTag[]
  deletedTag: DigitalAssetTag | null
  pending: boolean
  onOpenChange: (open: boolean) => void
  onManageTags: () => void
  onSubmit: (values: DigitalAssetFormValues) => Promise<void>
}

function normalizeTag(name: string): string {
  return name.trim().toLowerCase()
}

export function AssetFormDialog(props: AssetFormDialogProps) {
  const { t } = useTranslation()
  const isImage = props.asset?.asset_type === 'image'
  const [tagInput, setTagInput] = useState('')
  const schema = useMemo(
    () => getDigitalAssetFormSchema(t, isImage),
    [t, isImage]
  )
  const form = useForm<DigitalAssetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', content: '', tags: [] },
  })

  useEffect(() => {
    if (!props.open) return
    form.reset({
      title: props.asset?.title ?? props.initialPrompt?.title ?? '',
      content: props.asset?.content ?? props.initialPrompt?.content ?? '',
      tags: props.asset?.tags.map((tag) => tag.name) ?? [],
    })
    setTagInput('')
  }, [form, props.asset, props.initialPrompt, props.open])

  useEffect(() => {
    if (!props.deletedTag) return
    const currentTags = form.getValues('tags')
    form.setValue(
      'tags',
      currentTags.filter(
        (tag) =>
          normalizeTag(tag) !== normalizeTag(props.deletedTag?.name ?? '')
      ),
      { shouldValidate: true }
    )
  }, [form, props.deletedTag])

  const selectedTags = form.watch('tags')
  const allTags = [
    ...DIGITAL_ASSET_DEFAULT_TAGS,
    ...props.availableTags.map((tag) => tag.name),
    ...selectedTags,
  ].filter(
    (name, index, names) =>
      names.findIndex(
        (candidate) => normalizeTag(candidate) === normalizeTag(name)
      ) === index
  )

  const addTag = (rawName: string) => {
    const name = rawName.trim()
    if (!name) return
    if (name.length > 32) {
      toast.error(t('Tag must be 32 characters or fewer'))
      return
    }
    const existingTag = allTags.find(
      (tag) => normalizeTag(tag) === normalizeTag(name)
    )
    if (
      selectedTags.some(
        (tag) => normalizeTag(tag) === normalizeTag(existingTag ?? name)
      )
    ) {
      setTagInput('')
      return
    }
    if (selectedTags.length >= 20) {
      toast.error(t('You can add up to 20 tags'))
      return
    }
    form.setValue('tags', [...selectedTags, existingTag ?? name], {
      shouldValidate: true,
    })
    setTagInput('')
  }

  const toggleTag = (name: string) => {
    const selected = selectedTags.some(
      (tag) => normalizeTag(tag) === normalizeTag(name)
    )
    if (selected) {
      form.setValue(
        'tags',
        selectedTags.filter((tag) => normalizeTag(tag) !== normalizeTag(name)),
        { shouldValidate: true }
      )
      return
    }
    addTag(name)
  }

  const submit = form.handleSubmit(async (values) => {
    try {
      await props.onSubmit(values)
    } catch {
      // mutation 负责展示服务端错误，并保持表单打开。
    }
  })

  let dialogTitle = t('New prompt')
  if (props.asset) {
    dialogTitle = isImage ? t('Edit') : t('Edit prompt')
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={dialogTitle}
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
          {isImage ? (
            props.asset?.content ? (
              <FormItem>
                <FormLabel>{t('Prompt content')}</FormLabel>
                <div className='bg-muted/40 max-h-36 overflow-auto rounded-md border p-3'>
                  <p className='text-muted-foreground text-sm leading-5 break-words whitespace-pre-wrap'>
                    {props.asset.content}
                  </p>
                </div>
              </FormItem>
            ) : null
          ) : (
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
          )}
          <FormItem>
            <div className='flex items-center justify-between gap-3'>
              <FormLabel htmlFor='digital-asset-tag-input'>
                {t('Tags')}
              </FormLabel>
              {props.asset ? (
                <Button
                  type='button'
                  variant='outline'
                  size='xs'
                  onClick={props.onManageTags}
                >
                  {t('Manage tags')}
                </Button>
              ) : null}
            </div>
            <div
              className='flex max-h-36 flex-wrap gap-1.5 overflow-y-auto p-1'
              aria-label={t('Suggested tags')}
            >
              {allTags.map((tag) => {
                const selected = selectedTags.some(
                  (name) => normalizeTag(name) === normalizeTag(tag)
                )
                const selectionDisabled = !selected && selectedTags.length >= 20
                return (
                  <Button
                    key={normalizeTag(tag)}
                    type='button'
                    variant={selected ? 'secondary' : 'ghost'}
                    size='xs'
                    className='max-w-full'
                    disabled={selectionDisabled}
                    aria-pressed={selected}
                    title={tag}
                    onClick={() => toggleTag(tag)}
                  >
                    {selected ? (
                      <Check className='size-3' aria-hidden='true' />
                    ) : null}
                    <span className='truncate'>{tag}</span>
                  </Button>
                )
              })}
            </div>
            <Input
              id='digital-asset-tag-input'
              value={tagInput}
              maxLength={32}
              disabled={selectedTags.length >= 20}
              placeholder={t('Type and press Enter to create a new tag')}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
                  return
                }
                event.preventDefault()
                addTag(tagInput)
              }}
            />
          </FormItem>
        </form>
      </Form>
    </Dialog>
  )
}

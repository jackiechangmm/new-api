/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Loader2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { FeaturedPrompt, FeaturedPromptInput } from './types'

const FEATURED_PROMPT_MAX_COVER_BYTES = 5 * 1024 * 1024
const FEATURED_PROMPT_COVER_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

type FeaturedPromptDialogProps = {
  item: FeaturedPrompt | null
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: FeaturedPromptInput) => Promise<void>
}

export function FeaturedPromptDialog(props: FeaturedPromptDialogProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cover, setCover] = useState<File>()
  const [validation, setValidation] = useState('')

  useEffect(() => {
    if (!props.open) return
    setTitle(props.item?.title ?? '')
    setDescription(props.item?.description ?? '')
    setPrompt(props.item?.prompt ?? '')
    setCover(undefined)
    setValidation('')
  }, [props.item, props.open])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !description.trim() || !prompt.trim()) {
      setValidation(t('Complete all required fields'))
      return
    }
    if (!props.item && !cover) {
      setValidation(t('Choose a cover image'))
      return
    }
    if (
      cover &&
      (!FEATURED_PROMPT_COVER_TYPES.has(cover.type) ||
        cover.size > FEATURED_PROMPT_MAX_COVER_BYTES)
    ) {
      setValidation(
        t('Cover image must be JPEG, PNG or WebP and no larger than 5 MB')
      )
      return
    }
    setValidation('')
    await props.onSubmit({
      title: title.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      cover,
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.item ? t('Edit featured prompt') : t('New featured prompt')}
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
            disabled={props.pending}
            form='featured-prompt-form'
            type='submit'
          >
            {props.pending ? <Loader2 className='animate-spin' /> : null}
            {t('Save')}
          </Button>
        </>
      }
    >
      <form
        className='space-y-4'
        id='featured-prompt-form'
        onSubmit={(event) => void submit(event)}
      >
        <div className='space-y-2'>
          <Label htmlFor='featured-prompt-title'>{t('Title')}</Label>
          <Input
            autoFocus
            id='featured-prompt-title'
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='featured-prompt-description'>
            {t('Description')}
          </Label>
          <Textarea
            id='featured-prompt-description'
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            required
            rows={3}
            value={description}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='featured-prompt-content'>{t('Prompt content')}</Label>
          <Textarea
            className='min-h-40 resize-y'
            id='featured-prompt-content'
            maxLength={100000}
            onChange={(event) => setPrompt(event.target.value)}
            required
            rows={8}
            value={prompt}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='featured-prompt-cover'>
            {props.item ? t('Replace cover image') : t('Cover image')}
          </Label>
          <Input
            accept='image/jpeg,image/png,image/webp'
            id='featured-prompt-cover'
            onChange={(event) => {
              const file = event.target.files?.[0]
              setCover(file)
              if (
                file &&
                (!FEATURED_PROMPT_COVER_TYPES.has(file.type) ||
                  file.size > FEATURED_PROMPT_MAX_COVER_BYTES)
              ) {
                setValidation(
                  t(
                    'Cover image must be JPEG, PNG or WebP and no larger than 5 MB'
                  )
                )
              } else {
                setValidation('')
              }
            }}
            required={!props.item}
            type='file'
          />
          <p className='text-muted-foreground text-xs'>
            {t('JPEG, PNG or WebP, up to 5 MB')}
          </p>
        </div>
        {validation ? (
          <p className='text-destructive text-sm' role='alert'>
            {validation}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}

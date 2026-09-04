/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useIsAdmin } from '@/hooks/use-admin'

import {
  createFeaturedPrompt,
  deleteFeaturedPrompt,
  listFeaturedPrompts,
  moveFeaturedPrompt,
  updateFeaturedPrompt,
} from './api'
import { FeaturedPromptDialog } from './dialog'
import type {
  FeaturedPrompt,
  FeaturedPromptInput,
  FeaturedPromptPage,
} from './types'

const FEATURED_PROMPTS_PER_PAGE = 6

type FeaturedPromptSectionProps = {
  onPreview: (url: string) => void
  onSelect: (prompt: string) => void
}

export function FeaturedPromptSection(props: FeaturedPromptSectionProps) {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<FeaturedPromptPage>()
  const [loadFailed, setLoadFailed] = useState(false)
  const [managing, setManaging] = useState(false)
  const [editing, setEditing] = useState<FeaturedPrompt | null>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [movingID, setMovingID] = useState<number>()
  const [deleting, setDeleting] = useState<FeaturedPrompt>()

  const load = useCallback(async (requestedPage: number) => {
    try {
      const next = await listFeaturedPrompts(requestedPage)
      const pageCount = Math.max(
        1,
        Math.ceil(next.total / FEATURED_PROMPTS_PER_PAGE)
      )
      if (requestedPage > pageCount) {
        setPage(pageCount)
        return
      }
      setResult(next)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [load, page])

  const submit = async (input: FeaturedPromptInput) => {
    setPending(true)
    try {
      if (editing) {
        await updateFeaturedPrompt(editing.id, input)
        toast.success(t('Featured prompt updated'))
      } else {
        await createFeaturedPrompt(input)
        setPage(1)
        toast.success(t('Featured prompt created'))
      }
      setDialogOpen(false)
      await load(editing ? page : 1)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('Failed to save featured prompt')
      )
      throw error
    } finally {
      setPending(false)
    }
  }

  const move = async (item: FeaturedPrompt, direction: 'up' | 'down') => {
    setMovingID(item.id)
    try {
      await moveFeaturedPrompt(item.id, direction)
      await load(page)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('Failed to reorder featured prompts')
      )
    } finally {
      setMovingID(undefined)
    }
  }

  const remove = async () => {
    if (!deleting) return
    setPending(true)
    try {
      await deleteFeaturedPrompt(deleting.id)
      setDeleting(undefined)
      toast.success(t('Featured prompt deleted'))
      await load(page)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('Failed to delete featured prompt')
      )
    } finally {
      setPending(false)
    }
  }

  const items = result?.items ?? []
  const pageCount = Math.max(
    1,
    Math.ceil((result?.total ?? 0) / FEATURED_PROMPTS_PER_PAGE)
  )
  if (!isAdmin && (loadFailed || items.length === 0)) return null

  return (
    <section className='pt-6' aria-labelledby='featured-prompts-title'>
      <div className='mb-4 flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold' id='featured-prompts-title'>
          {t('Featured prompts')}
        </h2>
        {isAdmin ? (
          <div className='flex items-center gap-2'>
            {managing ? (
              <Button
                onClick={() => {
                  setEditing(null)
                  setDialogOpen(true)
                }}
                size='sm'
              >
                <Plus />
                {t('New featured prompt')}
              </Button>
            ) : null}
            <Button
              onClick={() => setManaging((current) => !current)}
              size='sm'
              variant='outline'
            >
              <Settings2 />
              {managing ? t('Finish managing') : t('Manage')}
            </Button>
          </div>
        ) : null}
      </div>

      {loadFailed ? (
        <div className='border-border text-muted-foreground border border-dashed p-6 text-center text-sm'>
          <p>{t('Failed to load featured prompts')}</p>
          <Button
            className='mt-3'
            onClick={() => void load(page)}
            size='sm'
            variant='outline'
          >
            {t('Retry')}
          </Button>
        </div>
      ) : null}
      {!loadFailed && items.length > 0 ? (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {items.map((item, index) => {
            const absoluteIndex = (page - 1) * FEATURED_PROMPTS_PER_PAGE + index
            return (
              <article
                className='flex h-[330px] flex-col overflow-hidden rounded-lg border p-4'
                key={item.id}
              >
                <button
                  aria-label={item.title}
                  className='bg-muted mb-3 h-32 overflow-hidden rounded-md'
                  onClick={() => props.onPreview(item.cover_url)}
                  type='button'
                >
                  <img
                    alt={item.title}
                    className='size-full object-cover'
                    loading='lazy'
                    src={item.cover_url}
                  />
                </button>
                <div className='flex min-h-12 items-start justify-between gap-2'>
                  <h3 className='line-clamp-2 font-medium'>{item.title}</h3>
                  {managing ? (
                    <TooltipProvider>
                      <div className='flex shrink-0 items-center'>
                        <PromptAction
                          disabled={absoluteIndex === 0 || movingID === item.id}
                          icon={<ArrowUp />}
                          label={t('Move up')}
                          onClick={() => void move(item, 'up')}
                        />
                        <PromptAction
                          disabled={
                            absoluteIndex + 1 >= (result?.total ?? 0) ||
                            movingID === item.id
                          }
                          icon={<ArrowDown />}
                          label={t('Move down')}
                          onClick={() => void move(item, 'down')}
                        />
                        <PromptAction
                          icon={<Edit3 />}
                          label={t('Edit')}
                          onClick={() => {
                            setEditing(item)
                            setDialogOpen(true)
                          }}
                        />
                        <PromptAction
                          icon={<Trash2 />}
                          label={t('Delete')}
                          onClick={() => setDeleting(item)}
                        />
                      </div>
                    </TooltipProvider>
                  ) : null}
                </div>
                <p className='text-muted-foreground mt-1 line-clamp-3 min-h-15 text-sm'>
                  {item.prompt}
                </p>
                <Button
                  className='mt-auto w-full'
                  onClick={() => props.onSelect(item.prompt)}
                  size='sm'
                  variant='outline'
                >
                  {t('Use prompt')}
                </Button>
              </article>
            )
          })}
        </div>
      ) : null}
      {!loadFailed && items.length === 0 ? (
        <div className='text-muted-foreground border border-dashed p-8 text-center text-sm'>
          {t('No featured prompts yet')}
        </div>
      ) : null}

      {(result?.total ?? 0) > FEATURED_PROMPTS_PER_PAGE ? (
        <div className='mt-5 flex items-center justify-center gap-3'>
          <Button
            aria-label={t('Previous page')}
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
            size='icon-sm'
            variant='outline'
          >
            <ChevronLeft />
          </Button>
          <span className='text-muted-foreground min-w-16 text-center text-sm tabular-nums'>
            {page} / {pageCount}
          </span>
          <Button
            aria-label={t('Next page')}
            disabled={page === pageCount}
            onClick={() => setPage((current) => current + 1)}
            size='icon-sm'
            variant='outline'
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}

      <FeaturedPromptDialog
        item={editing ?? null}
        onOpenChange={setDialogOpen}
        onSubmit={submit}
        open={dialogOpen}
        pending={pending}
      />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete featured prompt?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This permanently deletes the featured prompt and its cover image.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => void remove()}>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function PromptAction(props: {
  disabled?: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={props.label}
            disabled={props.disabled}
            onClick={props.onClick}
            size='icon-xs'
            variant='ghost'
          />
        }
      >
        {props.icon}
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

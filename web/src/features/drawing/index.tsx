import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import {
  generateImages,
  getDrawingGroups,
  getDrawingModels,
  type ImageGenerationRequest,
} from './api'
import { filterDrawingPrompts, type DrawingPrompt } from './prompts'
import {
  deleteDrawingHistory,
  listDrawingHistory,
  saveDrawingHistory,
  type DrawingHistoryRecord,
} from './storage'

type PreviewSource = Blob | string

type PreviewState = {
  images: PreviewSource[]
  index: number
}

const PAGE_SIZE = 4
const ASPECT_RATIOS = [
  'auto',
  '1:1',
  '1:3',
  '3:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '21:9',
  '9:21',
]
const RESOLUTIONS = ['1k', '2k', '4k']
const QUALITIES = ['auto', 'low', 'medium', 'high']

function useBlobUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [blob])
  return url
}

function HistoryImage({ blob, onClick }: { blob: Blob; onClick: () => void }) {
  const url = useBlobUrl(blob)
  return (
    <button
      className='bg-muted aspect-square w-full overflow-hidden rounded-md'
      onClick={onClick}
      type='button'
    >
      {url ? (
        <img alt='' className='size-full w-full object-cover' src={url} />
      ) : null}
    </button>
  )
}

export function Drawing() {
  const { t } = useTranslation()
  const [models, setModels] = useState<string[]>([])
  const [group, setGroup] = useState('')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('auto')
  const [resolution, setResolution] = useState('1k')
  const [quality, setQuality] = useState('auto')
  const [count, setCount] = useState(1)
  const [history, setHistory] = useState<DrawingHistoryRecord[]>([])
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PreviewState>()
  const scrollRef = useRef<HTMLElement>(null)
  const [columns, setColumns] = useState(1)

  useEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth >= 1024) {
        setColumns(3)
      } else if (window.innerWidth >= 640) {
        setColumns(2)
      } else {
        setColumns(1)
      }
    }
    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  useEffect(() => {
    void Promise.all([getDrawingGroups(), listDrawingHistory()])
      .then(([nextGroups, records]) => {
        setHistory(records)
        if (nextGroups[0]) setGroup(nextGroups[0].value)
      })
      .catch(() => setError(t('Failed to load drawing data')))
  }, [t])

  useEffect(() => {
    if (!group) return
    void getDrawingModels(group)
      .then((nextModels) => {
        setModels(nextModels)
        setModel((current) =>
          nextModels.includes(current) ? current : (nextModels[0] ?? '')
        )
      })
      .catch(() => setError(t('Failed to load image models')))
  }, [group, t])

  const prompts = useMemo(
    () => filterDrawingPrompts(deferredQuery, ''),
    [deferredQuery]
  )
  const visibleHistory = history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE))

  const submit = async () => {
    if (!prompt.trim() || !model || !group) return
    setError('')
    setIsGenerating(true)
    const payload: ImageGenerationRequest = {
      model,
      group,
      prompt: prompt.trim(),
      size: `${aspectRatio} ${resolution}`,
      quality,
      n: count,
      response_format: 'b64_json',
    }
    try {
      const response = await generateImages(payload)
      const images = (response.data ?? [])
        .map((item) => item.b64_json)
        .filter((value): value is string => Boolean(value))
        .map((value) => {
          const binary = atob(value)
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
          return new Blob([bytes], { type: 'image/png' })
        })
      if (!images.length) {
        throw new Error(t('The image response did not contain an image'))
      }
      const record: DrawingHistoryRecord = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        prompt: payload.prompt,
        model,
        group,
        size: payload.size,
        quality,
        n: count,
        images,
      }
      setHistory((current) => [record, ...current])
      setPage(0)
      if (!(await saveDrawingHistory(record))) {
        toast.warning(t('This result could not be saved in local history'))
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : t('Image generation failed')
      setError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const remove = async (id: string) => {
    await deleteDrawingHistory(id)
    setHistory((current) => current.filter((record) => record.id !== id))
    setPage((current) =>
      Math.min(
        current,
        Math.max(0, Math.ceil((history.length - 1) / PAGE_SIZE) - 1)
      )
    )
  }

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  }

  const reuse = (record: DrawingHistoryRecord) => {
    setPrompt(record.prompt)
    setModel(record.model)
    setGroup(record.group)
    const savedSize = record.size.split(' ')
    setAspectRatio(savedSize.length === 2 ? savedSize[0] : 'auto')
    setResolution(savedSize.length === 2 ? savedSize[1] : '1k')
    setQuality(record.quality)
    setCount(record.n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const selectPrompt = (value: string) => {
    setPrompt(value)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <Main ref={scrollRef} className='overflow-y-auto p-4 md:p-6'>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-8'>
        <section className='pb-6'>
          <div className='mb-5'>
            <h1 className='text-2xl font-semibold'>{t('Drawing Plaza')}</h1>
          </div>
          <textarea
            aria-label={t('Prompt word')}
            className='bg-background focus:ring-ring min-h-28 w-full resize-y rounded-lg border p-3 outline-none focus:ring-2'
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t('Describe the image you want to create')}
            value={prompt}
          />
          <div className='mt-4 grid gap-4 sm:grid-cols-5'>
            <label className='space-y-1 text-sm'>
              <span>{t('Image model')}</span>
              <NativeSelect
                aria-label={t('Image model')}
                className='w-full'
                disabled={!models.length}
                onChange={(event) => setModel(event.target.value)}
                value={model}
              >
                {models.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className='space-y-1 text-sm'>
              <span>{t('Aspect ratio')}</span>
              <NativeSelect
                aria-label={t('Aspect ratio')}
                className='w-full'
                onChange={(event) => setAspectRatio(event.target.value)}
                value={aspectRatio}
              >
                {ASPECT_RATIOS.map((value) => (
                  <NativeSelectOption key={value}>{value}</NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className='space-y-1 text-sm'>
              <span>{t('Resolution')}</span>
              <NativeSelect
                aria-label={t('Resolution')}
                className='w-full'
                onChange={(event) => setResolution(event.target.value)}
                value={resolution}
              >
                {RESOLUTIONS.map((value) => (
                  <NativeSelectOption key={value}>{value}</NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className='space-y-1 text-sm'>
              <span>{t('Quality')}</span>
              <NativeSelect
                aria-label={t('Quality')}
                className='w-full'
                onChange={(event) => setQuality(event.target.value)}
                value={quality}
              >
                {QUALITIES.map((value) => (
                  <NativeSelectOption key={value}>{value}</NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className='space-y-1 text-sm'>
              <span>{t('Images')}</span>
              <NativeSelect
                aria-label={t('Images')}
                className='w-full'
                onChange={(event) => setCount(Number(event.target.value))}
                value={count}
              >
                {[1, 2, 3, 4].map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          </div>
          {error ? (
            <p className='text-destructive mt-3 text-sm' role='alert'>
              {error}
            </p>
          ) : null}
          <div className='mt-4 flex items-center gap-3'>
            <Button
              disabled={isGenerating || !model || !group || !prompt.trim()}
              onClick={() => void submit()}
            >
              <WandSparkles />
              {isGenerating ? t('Generating...') : t('Generate')}
            </Button>
            {!models.length ? (
              <span className='text-muted-foreground text-sm'>
                {t('No image models are available for this group.')}
              </span>
            ) : null}
          </div>
        </section>

        <section>
          <div className='mb-4 flex items-center justify-between gap-3'>
            <div>
              <h2 className='text-lg font-semibold'>{t('Drawing history')}</h2>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Drawing results are temporarily stored in the browser. Download and save them promptly.'
                )}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                aria-label={t('Previous page')}
                disabled={page === 0}
                onClick={() => setPage((current) => current - 1)}
                size='icon-sm'
                variant='outline'
              >
                ←
              </Button>
              <span className='text-sm'>
                {page + 1} / {pageCount}
              </span>
              <Button
                aria-label={t('Next page')}
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => current + 1)}
                size='icon-sm'
                variant='outline'
              >
                →
              </Button>
            </div>
          </div>
          {visibleHistory.length ? (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              {visibleHistory.map((record) => (
                <HistoryCard
                  key={record.id}
                  record={record}
                  onDelete={() => void remove(record.id)}
                  onDownload={download}
                  onPreview={(images, index) => setPreview({ images, index })}
                  onReuse={reuse}
                />
              ))}
            </div>
          ) : (
            <div className='text-muted-foreground border border-dashed p-8 text-center text-sm'>
              {t('Your generated images will appear here.')}
            </div>
          )}
        </section>

        <section className='pt-6'>
          <div className='mb-4 flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h2 className='text-lg font-semibold'>{t('Prompt library')}</h2>
            </div>
            <div className='relative'>
              <Search className='text-muted-foreground absolute top-2 left-2 size-4' />
              <Input
                aria-label={t('Search prompts')}
                className='w-52 pl-8'
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Search prompts')}
                value={query}
              />
            </div>
          </div>
          <PromptGrid
            columns={columns}
            onSelect={selectPrompt}
            onPreview={(url: string) => setPreview({ images: [url], index: 0 })}
            prompts={prompts}
            scrollElement={scrollRef}
          />
        </section>
      </div>
      {preview ? (
        <PreviewDialog
          images={preview.images}
          initialIndex={preview.index}
          onClose={() => setPreview(undefined)}
        />
      ) : null}
    </Main>
  )
}

function HistoryCard(props: {
  record: DrawingHistoryRecord
  onDelete: () => void
  onDownload: (blob: Blob, name: string) => void
  onPreview: (images: Blob[], index: number) => void
  onReuse: (record: DrawingHistoryRecord) => void
}) {
  const { t } = useTranslation()
  return (
    <article className='overflow-hidden rounded-lg border'>
      <div className='relative p-1'>
        <HistoryImage
          blob={props.record.images[0]}
          onClick={() => props.onPreview(props.record.images, 0)}
        />
        {props.record.images.length > 1 ? (
          <span className='bg-background/90 absolute top-3 right-3 rounded-full px-2 py-0.5 text-xs font-medium'>
            {t('{{count}} images', { count: props.record.images.length })}
          </span>
        ) : null}
      </div>
      <div className='space-y-2 p-3'>
        <p className='line-clamp-2 text-sm'>{props.record.prompt}</p>
        <p className='text-muted-foreground text-xs'>
          {props.record.model} · {props.record.size} · {props.record.quality}
        </p>
        <div className='flex gap-1'>
          <Button
            onClick={() => props.onReuse(props.record)}
            size='sm'
            variant='outline'
          >
            <RefreshCw />
            {t('Reuse')}
          </Button>
          <Button
            aria-label={t('Download')}
            onClick={() =>
              props.onDownload(props.record.images[0], `${props.record.id}.png`)
            }
            size='icon-sm'
            variant='ghost'
          >
            <Download />
          </Button>
          <Button
            aria-label={t('Delete')}
            onClick={props.onDelete}
            size='icon-sm'
            variant='ghost'
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </article>
  )
}

function PromptGrid(props: {
  columns: number
  prompts: DrawingPrompt[]
  onSelect: (prompt: string) => void
  onPreview: (url: string) => void
  scrollElement: React.RefObject<HTMLElement | null>
}) {
  const rows = useMemo(() => {
    const result: DrawingPrompt[][] = []
    for (let index = 0; index < props.prompts.length; index += props.columns) {
      result.push(props.prompts.slice(index, index + props.columns))
    }
    return result
  }, [props.columns, props.prompts])
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 390,
    getScrollElement: () => props.scrollElement.current,
    overscan: 2,
  })

  return (
    <div
      className='relative w-full'
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <div
          className='absolute top-0 left-0 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3'
          data-index={virtualRow.index}
          key={virtualRow.key}
          ref={virtualizer.measureElement}
          style={{ transform: `translateY(${virtualRow.start}px)` }}
        >
          {rows[virtualRow.index].map((item) => (
            <PromptCard
              key={item.id}
              item={item}
              onPreview={props.onPreview}
              onSelect={props.onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function PromptCard(props: {
  item: DrawingPrompt
  onSelect: (prompt: string) => void
  onPreview: (url: string) => void
}) {
  const { t } = useTranslation()
  const [coverFailed, setCoverFailed] = useState(false)
  const showCover = Boolean(props.item.coverUrl) && !coverFailed
  return (
    <article className='flex h-[370px] flex-col overflow-hidden rounded-lg border p-4'>
      <div className='bg-muted mb-3 h-32 overflow-hidden rounded-md'>
        {showCover ? (
          <button
            aria-label={props.item.title}
            className='size-full'
            onClick={() => props.onPreview(props.item.coverUrl ?? '')}
            type='button'
          >
            <img
              alt={props.item.title}
              className='size-full object-cover'
              loading='lazy'
              onError={() => setCoverFailed(true)}
              src={props.item.coverUrl}
            />
          </button>
        ) : (
          <div className='text-muted-foreground flex size-full items-center justify-center px-4 text-center text-sm'>
            {props.item.title}
          </div>
        )}
      </div>
      <h3 className='line-clamp-2 min-h-12 font-medium'>{props.item.title}</h3>
      <p className='text-muted-foreground mt-1 line-clamp-3 min-h-15 text-sm'>
        {props.item.description || props.item.prompt}
      </p>
      <div className='mt-3 flex max-h-7 min-h-7 flex-wrap gap-1 overflow-hidden'>
        {props.item.tags.map((tag) => (
          <span
            className='bg-muted inline-flex h-6 items-center rounded px-2 text-xs'
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
      <Button
        className='mt-auto w-full'
        onClick={() => props.onSelect(props.item.prompt)}
        size='sm'
        variant='outline'
      >
        {t('Use prompt')}
      </Button>
    </article>
  )
}

function PreviewDialog(props: {
  images: PreviewSource[]
  initialIndex: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(props.initialIndex)
  const current = props.images[index]
  const objectUrl = useBlobUrl(
    typeof current === 'string' ? undefined : current
  )
  const url = typeof current === 'string' ? current : objectUrl
  const hasMultiple = props.images.length > 1

  useEffect(() => {
    setIndex(props.initialIndex)
  }, [props.initialIndex])

  useEffect(() => {
    if (!hasMultiple) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setIndex(
          (value) => (value - 1 + props.images.length) % props.images.length
        )
      } else if (event.key === 'ArrowRight') {
        setIndex((value) => (value + 1) % props.images.length)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasMultiple, props.images.length])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className='max-w-5xl bg-black/90 p-2' showCloseButton>
        <div className='group relative flex min-h-[50vh] items-center justify-center'>
          {url ? (
            <img
              alt={t('Image preview')}
              className='max-h-[85vh] w-full object-contain'
              src={url}
            />
          ) : (
            <Loader2 className='mx-auto size-8 animate-spin text-white' />
          )}
          {hasMultiple ? (
            <>
              <Button
                aria-label={t('Previous image')}
                className='absolute left-2 opacity-0 transition-opacity group-hover:opacity-100'
                onClick={() =>
                  setIndex(
                    (value) =>
                      (value - 1 + props.images.length) % props.images.length
                  )
                }
                size='icon'
                variant='secondary'
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label={t('Next image')}
                className='absolute right-2 opacity-0 transition-opacity group-hover:opacity-100'
                onClick={() =>
                  setIndex((value) => (value + 1) % props.images.length)
                }
                size='icon'
                variant='secondary'
              >
                <ChevronRight />
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

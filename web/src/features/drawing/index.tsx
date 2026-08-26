import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  getDrawingModels,
  requestDrawingImages,
  type ImageGenerationRequest,
} from './api'
import {
  getDrawingModelConfig,
  getFixedOrSelectedValue,
  type DrawingOperationConfig,
} from './model-config'
import { filterDrawingPrompts, type DrawingPrompt } from './prompts'
import {
  deleteDrawingHistory,
  listDrawingHistory,
  saveDrawingHistory,
  type DrawingHistoryRecord,
} from './storage'
import { validateReferenceImage } from './validation'

type PreviewSource = Blob | string

type PreviewState = {
  images: PreviewSource[]
  index: number
}

const PAGE_SIZE = 8

function DrawingSelect(props: {
  ariaLabel: string
  disabled?: boolean
  onChange: (value: string) => void
  options: string[]
  value: string
}) {
  return (
    <Select
      disabled={props.disabled}
      onValueChange={(value) => {
        if (value) props.onChange(value)
      }}
      value={props.value}
    >
      <SelectTrigger aria-label={props.ariaLabel} className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {props.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
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
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('auto')
  const [resolution, setResolution] = useState('1k')
  const [quality, setQuality] = useState('auto')
  const [count, setCount] = useState(1)
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [referenceError, setReferenceError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [history, setHistory] = useState<DrawingHistoryRecord[]>([])
  const [historyVisibleCount, setHistoryVisibleCount] = useState(PAGE_SIZE)
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
    void Promise.all([getDrawingModels(), listDrawingHistory()])
      .then(([nextModels, records]) => {
        setHistory(records)
        setModels(nextModels)
        setModel(nextModels[0] ?? '')
      })
      .catch(() => setError(t('Failed to load drawing data')))
  }, [t])

  const prompts = useMemo(
    () => filterDrawingPrompts(deferredQuery, ''),
    [deferredQuery]
  )
  const visibleHistory = history.slice(0, historyVisibleCount)
  const hasMoreHistory = historyVisibleCount < history.length
  const modelConfig = getDrawingModelConfig(model)
  const referenceInput = modelConfig?.imageToImage?.input
  const hasEditModel = Boolean(referenceInput)
  const activeOperation: DrawingOperationConfig | undefined =
    referenceImages.length > 0
      ? modelConfig?.imageToImage
      : modelConfig?.textToImage

  useEffect(() => {
    const nextAspectRatio = getFixedOrSelectedValue(
      activeOperation?.aspectRatios,
      aspectRatio
    )
    const nextResolution = getFixedOrSelectedValue(
      activeOperation?.resolutions,
      resolution
    )
    const nextQuality = getFixedOrSelectedValue(
      activeOperation?.qualities,
      quality
    )
    setAspectRatio(nextAspectRatio ?? '')
    setResolution(nextResolution ?? '')
    setQuality(nextQuality ?? '')
    setCount((current) =>
      activeOperation
        ? Math.min(Math.max(current, 1), activeOperation.maxOutputs)
        : 1
    )
  }, [activeOperation, aspectRatio, quality, resolution])

  useEffect(() => {
    if (model && !hasEditModel && referenceImages.length > 0) {
      setReferenceImages([])
      setReferenceError('')
    }
  }, [hasEditModel, model, referenceImages.length])

  const submit = async () => {
    if (
      !prompt.trim() ||
      !model ||
      !modelConfig ||
      !activeOperation ||
      (referenceImages.length > 0 && !hasEditModel)
    ) {
      return
    }
    setError('')
    setIsGenerating(true)
    const aspect = getFixedOrSelectedValue(
      activeOperation?.aspectRatios,
      aspectRatio
    )
    const resolutionValue = getFixedOrSelectedValue(
      activeOperation?.resolutions,
      resolution
    )
    const size =
      aspect && resolutionValue ? `${aspect} ${resolutionValue}` : undefined
    const qualityValue = getFixedOrSelectedValue(
      activeOperation?.qualities,
      quality
    )
    const payload: ImageGenerationRequest = {
      model,
      prompt: prompt.trim(),
      n: count,
      response_format: 'b64_json',
      ...(size ? { size } : {}),
      ...(qualityValue ? { quality: qualityValue } : {}),
    }
    try {
      const response = await requestDrawingImages(
        modelConfig.requestFormat,
        referenceImages.length
          ? { ...payload, images: referenceImages }
          : payload
      )
      const images = (response.data ?? [])
        .filter((item) => Boolean(item.b64_json))
        .map((item) => {
          const binary = atob(item.b64_json as string)
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
          return new Blob([bytes], { type: item.mime_type || 'image/png' })
        })
      if (!images.length) {
        throw new Error(t('The image response did not contain an image'))
      }
      const record: DrawingHistoryRecord = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        prompt: payload.prompt,
        model,
        size: payload.size ?? '',
        quality: payload.quality ?? '',
        n: count,
        images,
        referenceImages: [...referenceImages],
      }
      setHistory((current) => [record, ...current])
      setHistoryVisibleCount((current) => Math.max(current, PAGE_SIZE))
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
    setHistoryVisibleCount((current) =>
      Math.min(current, Math.max(PAGE_SIZE, history.length - 1))
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
    const savedSize = record.size.split(' ')
    setAspectRatio(savedSize.length === 2 ? savedSize[0] : 'auto')
    setResolution(savedSize.length === 2 ? savedSize[1] : '1k')
    setQuality(record.quality)
    setCount(record.n)
    setReferenceImages(
      (record.referenceImages ?? []).map(
        (blob, index) =>
          new File([blob], `reference-${index}.png`, { type: blob.type })
      )
    )
    setReferenceError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const referenceBytes = referenceImages.reduce(
    (total, file) => total + file.size,
    0
  )

  const addReferenceImages = async (files: FileList | null) => {
    if (!files) return
    const nextFiles = [...referenceImages]
    let nextError = ''
    for (const file of files) {
      const errorKey = await validateReferenceImage(
        file,
        nextFiles.length,
        nextFiles.reduce((total, item) => total + item.size, 0),
        referenceInput
      )
      if (errorKey) {
        nextError = t(
          {
            unsupported: 'Reference image format is not supported.',
            'too-many': 'You can select up to 4 reference images.',
            'too-large': 'Reference images must be 20 MB or smaller in total.',
            'too-wide':
              'Reference image dimensions must be 4096 pixels or smaller.',
          }[errorKey]
        )
        continue
      }
      nextFiles.push(file)
    }
    setReferenceImages(nextFiles)
    setReferenceError(nextError)
  }

  const promptInputRef = useRef<HTMLTextAreaElement>(null)

  const selectPrompt = (value: string) => {
    setPrompt(value)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    requestAnimationFrame(() => promptInputRef.current?.focus())
  }

  return (
    <Main ref={scrollRef} className='relative overflow-y-auto p-4 md:p-6'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-0 h-[35vh] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)] opacity-70'
      >
        <div
          className='absolute inset-0 opacity-50'
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 30px 20px, #fff, transparent), radial-gradient(1.2px 1.2px at 90px 70px, #93c5fd, transparent), radial-gradient(1px 1px at 170px 35px, #fff, transparent), radial-gradient(1.5px 1.5px at 260px 100px, #fff, transparent), radial-gradient(1px 1px at 390px 40px, #60a5fa, transparent)',
            backgroundRepeat: 'repeat',
            backgroundSize: '450px 200px',
          }}
        />
        <div
          className='absolute top-[18vh] left-1/2 size-[180vw] -translate-x-1/2 rounded-full'
          style={{
            background:
              'radial-gradient(circle at 50% 0%, rgba(13, 19, 32, 0.9) 0%, rgba(18, 18, 18, 0) 65%)',
            boxShadow:
              '0 -1px 3px rgba(255, 255, 255, 0.65), 0 -6px 18px rgba(147, 197, 253, 0.35), 0 -15px 45px rgba(56, 189, 248, 0.18)',
          }}
        />
      </div>
      <div className='relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8'>
        <section className='pt-[25vh] pb-6'>
          <div className='mb-5'>
            <h1 className='text-2xl font-semibold'>{t('Drawing Plaza')}</h1>
          </div>
          <div className='bg-background focus-within:border-primary/50 focus-within:ring-primary/15 relative mx-auto flex h-[160px] w-full flex-col rounded-lg border p-3 transition-colors focus-within:ring-2'>
            <textarea
              aria-label={t('Prompt word')}
              className='min-h-0 flex-1 resize-none overflow-y-auto bg-transparent outline-none'
              disabled={isGenerating}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('Describe the image you want to create')}
              ref={promptInputRef}
              value={prompt}
            />
            <input
              accept={referenceInput?.formats.join(',')}
              className='hidden'
              multiple
              onChange={(event) => {
                void addReferenceImages(event.target.files)
                event.target.value = ''
              }}
              ref={fileInputRef}
              type='file'
            />
            <div className='mt-2 flex min-h-10 items-end justify-between gap-3 pt-2'>
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                <Button
                  aria-label={t('Add reference images')}
                  className='size-10'
                  disabled={
                    !hasEditModel ||
                    isGenerating ||
                    !referenceInput ||
                    referenceImages.length >=
                      (referenceInput.maxImages ?? Infinity)
                  }
                  onClick={() => fileInputRef.current?.click()}
                  size='icon'
                  type='button'
                  variant='outline'
                >
                  <Plus />
                </Button>
                {referenceImages.map((file, index) => (
                  <ReferenceImage
                    file={file}
                    key={`${file.name}-${file.lastModified}-${file.size}`}
                    onDelete={() =>
                      setReferenceImages((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                    onPreview={() => setPreview({ images: [file], index: 0 })}
                  />
                ))}
              </div>
              <Button
                aria-label={isGenerating ? t('Generating...') : t('Generate')}
                className='size-11 shrink-0 rounded-full'
                disabled={
                  isGenerating ||
                  !model ||
                  !activeOperation ||
                  !prompt.trim() ||
                  (referenceImages.length > 0 && !hasEditModel)
                }
                onClick={() => void submit()}
                size='icon'
                type='button'
              >
                {isGenerating ? (
                  <Loader2 className='animate-spin' />
                ) : (
                  <WandSparkles />
                )}
              </Button>
            </div>
          </div>
          {referenceError ? (
            <p className='text-destructive mt-2 text-sm' role='alert'>
              {referenceError}
            </p>
          ) : null}
          <div className='mt-4 grid gap-4 sm:grid-cols-5'>
            <label className='space-y-1 text-sm'>
              <span>{t('Image model')}</span>
              <DrawingSelect
                ariaLabel={t('Image model')}
                disabled={!models.length}
                onChange={(nextModel) => {
                  setModel(nextModel)
                  setReferenceImages([])
                  setReferenceError('')
                }}
                options={models}
                value={model}
              />
            </label>
            {activeOperation?.aspectRatios?.length ? (
              <label className='space-y-1 text-sm'>
                <span>{t('Aspect ratio')}</span>
                <DrawingSelect
                  ariaLabel={t('Aspect ratio')}
                  disabled={activeOperation.aspectRatios.length === 1}
                  onChange={setAspectRatio}
                  options={activeOperation.aspectRatios}
                  value={aspectRatio}
                />
              </label>
            ) : null}
            {activeOperation?.resolutions?.length ? (
              <label className='space-y-1 text-sm'>
                <span>{t('Resolution')}</span>
                <DrawingSelect
                  ariaLabel={t('Resolution')}
                  disabled={activeOperation.resolutions.length === 1}
                  onChange={setResolution}
                  options={activeOperation.resolutions}
                  value={resolution}
                />
              </label>
            ) : null}
            {activeOperation?.qualities?.length ? (
              <label className='space-y-1 text-sm'>
                <span>{t('Quality')}</span>
                <DrawingSelect
                  ariaLabel={t('Quality')}
                  disabled={activeOperation.qualities.length === 1}
                  onChange={setQuality}
                  options={activeOperation.qualities}
                  value={quality}
                />
              </label>
            ) : null}
            {activeOperation ? (
              <label className='space-y-1 text-sm'>
                <span>{t('Images')}</span>
                <DrawingSelect
                  ariaLabel={t('Images')}
                  disabled={activeOperation.maxOutputs === 1}
                  onChange={(value) => setCount(Number(value))}
                  options={Array.from(
                    { length: activeOperation.maxOutputs },
                    (_, index) => String(index + 1)
                  )}
                  value={String(count)}
                />
              </label>
            ) : null}
          </div>
          {error ? (
            <p className='text-destructive mt-3 text-sm' role='alert'>
              {error}
            </p>
          ) : null}
          <div className='mt-4 flex flex-wrap items-center gap-3'>
            {!models.length ? (
              <span className='text-muted-foreground text-sm'>
                {t('No image models are available for this group.')}
              </span>
            ) : null}
            {models.length > 0 && !hasEditModel ? (
              <span className='text-muted-foreground text-sm'>
                {t('Reference images are unavailable for this model.')}
              </span>
            ) : null}
            {referenceImages.length ? (
              <span className='text-muted-foreground text-xs'>
                {t('{{count}} reference images, {{size}} MB', {
                  count: referenceImages.length,
                  size: (referenceBytes / 1024 / 1024).toFixed(1),
                })}
              </span>
            ) : null}
          </div>
        </section>

        <section>
          <div className='mb-4 flex items-end justify-between gap-3'>
            <div>
              <h2 className='text-lg font-semibold'>{t('Drawing history')}</h2>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Drawing results are temporarily stored in the browser. Download and save them promptly.'
                )}
              </p>
            </div>
            {history.length ? (
              <span className='text-muted-foreground shrink-0 text-xs'>
                {visibleHistory.length} / {history.length}
              </span>
            ) : null}
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
          {hasMoreHistory ? (
            <div className='mt-5 flex justify-center'>
              <Button
                aria-label={t('More')}
                onClick={() =>
                  setHistoryVisibleCount((current) => current + PAGE_SIZE)
                }
                size='sm'
                variant='outline'
              >
                {t('More')}
                <ChevronDown />
              </Button>
            </div>
          ) : null}
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

function ReferenceImage(props: {
  file: File
  onDelete: () => void
  onPreview: () => void
}) {
  const { t } = useTranslation()
  const url = useBlobUrl(props.file)
  return (
    <div className='relative size-10 shrink-0'>
      <button
        aria-label={t('Preview reference image')}
        className='size-full overflow-hidden rounded-md border'
        onClick={props.onPreview}
        type='button'
      >
        {url ? (
          <img alt='' className='size-full object-cover' src={url} />
        ) : null}
      </button>
      <button
        aria-label={t('Remove reference image')}
        className='bg-background absolute -top-2 -right-2 rounded-full border p-0.5'
        onClick={props.onDelete}
        type='button'
      >
        <X className='size-3' />
      </button>
    </div>
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
    estimateSize: () => 370,
    getScrollElement: () => props.scrollElement.current,
    overscan: 6,
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

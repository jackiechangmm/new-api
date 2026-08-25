import {
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Main } from '@/components/layout'

import {
  generateImages,
  getDrawingGroups,
  getDrawingModels,
  type ImageGenerationRequest,
} from './api'
import { filterDrawingPrompts, DRAWING_PROMPTS, type DrawingPrompt } from './prompts'
import {
  deleteDrawingHistory,
  listDrawingHistory,
  saveDrawingHistory,
  type DrawingHistoryRecord,
} from './storage'

const PAGE_SIZE = 4
const SIZES = ['1024x1024', '1536x1024', '1024x1536']
const QUALITIES = ['low', 'medium', 'high']

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
    <button className='aspect-square overflow-hidden rounded-md bg-muted' onClick={onClick} type='button'>
      {url ? <img alt='' className='size-full object-cover' src={url} /> : null}
    </button>
  )
}

export function Drawing() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Array<{ value: string; label: string; desc: string }>>([])
  const [models, setModels] = useState<string[]>([])
  const [group, setGroup] = useState('')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(SIZES[0])
  const [quality, setQuality] = useState(QUALITIES[1])
  const [count, setCount] = useState(1)
  const [history, setHistory] = useState<DrawingHistoryRecord[]>([])
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Blob>()

  useEffect(() => {
    void Promise.all([getDrawingGroups(), listDrawingHistory()])
      .then(([nextGroups, records]) => {
        setGroups(nextGroups)
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
        setModel((current) => (nextModels.includes(current) ? current : nextModels[0] ?? ''))
      })
      .catch(() => setError(t('Failed to load image models')))
  }, [group, t])

  const tags = useMemo(
    () => [...new Set(DRAWING_PROMPTS.flatMap((item) => item.tags))].sort(),
    []
  )
  const prompts = useMemo(() => filterDrawingPrompts(query, tag), [query, tag])
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
      size,
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
      if (!images.length) throw new Error(t('The image response did not contain an image'))
      const record: DrawingHistoryRecord = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        prompt: payload.prompt,
        model,
        group,
        size,
        quality,
        n: count,
        images,
      }
      setHistory((current) => [record, ...current])
      setPage(0)
      if (!(await saveDrawingHistory(record))) toast.warning(t('This result could not be saved in local history'))
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : t('Image generation failed')
      setError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const remove = async (id: string) => {
    await deleteDrawingHistory(id)
    setHistory((current) => current.filter((record) => record.id !== id))
    setPage((current) => Math.min(current, Math.max(0, Math.ceil((history.length - 1) / PAGE_SIZE) - 1)))
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
    setSize(record.size)
    setQuality(record.quality)
    setCount(record.n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <Main className='overflow-y-auto p-4 md:p-6'>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-8'>
        <section className='border-b pb-6'>
          <div className='mb-5 flex items-start justify-between gap-4'>
            <div>
              <p className='mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground'>{t('AI Apps')}</p>
              <h1 className='text-2xl font-semibold'>{t('Drawing Plaza')}</h1>
              <p className='mt-1 text-sm text-muted-foreground'>{t('Create images with your available image models.')}</p>
            </div>
            <ImageIcon className='mt-1 size-6 text-muted-foreground' />
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            <label className='space-y-1 text-sm'><span>{t('Image model')}</span><select aria-label={t('Image model')} className='h-9 w-full rounded-md border bg-background px-2' disabled={!models.length} onChange={(event) => setModel(event.target.value)} value={model}>{models.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className='space-y-1 text-sm'><span>{t('Group')}</span><select aria-label={t('Group')} className='h-9 w-full rounded-md border bg-background px-2' onChange={(event) => setGroup(event.target.value)} value={group}>{groups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
          <label className='mt-4 block space-y-1 text-sm'><span>{t('Prompt')}</span><textarea aria-label={t('Prompt')} className='min-h-28 w-full resize-y rounded-md border bg-background p-3 outline-none focus:ring-2 focus:ring-ring' onChange={(event) => setPrompt(event.target.value)} placeholder={t('Describe the image you want to create')} value={prompt} /></label>
          <div className='mt-4 grid gap-4 sm:grid-cols-3'>
            <label className='space-y-1 text-sm'><span>{t('Size')}</span><select aria-label={t('Size')} className='h-9 w-full rounded-md border bg-background px-2' onChange={(event) => setSize(event.target.value)} value={size}>{SIZES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className='space-y-1 text-sm'><span>{t('Quality')}</span><select aria-label={t('Quality')} className='h-9 w-full rounded-md border bg-background px-2' onChange={(event) => setQuality(event.target.value)} value={quality}>{QUALITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className='space-y-1 text-sm'><span>{t('Images')}</span><input aria-label={t('Images')} className='h-9 w-full rounded-md border bg-background px-2' max={4} min={1} onChange={(event) => setCount(Math.min(4, Math.max(1, Number(event.target.value) || 1)))} type='number' value={count} /></label>
          </div>
          {error ? <p className='mt-3 text-sm text-destructive' role='alert'>{error}</p> : null}
          <div className='mt-4 flex items-center gap-3'><Button disabled={isGenerating || !model || !group || !prompt.trim()} onClick={() => void submit()}><WandSparkles />{isGenerating ? t('Generating...') : t('Generate')}</Button>{!models.length ? <span className='text-sm text-muted-foreground'>{t('No image models are available for this group.')}</span> : null}</div>
        </section>

        <section>
          <div className='mb-4 flex items-center justify-between gap-3'><div><h2 className='text-lg font-semibold'>{t('Drawing history')}</h2><p className='text-sm text-muted-foreground'>{t('Saved only in this browser')}</p></div><div className='flex items-center gap-2'><Button aria-label={t('Previous page')} disabled={page === 0} onClick={() => setPage((current) => current - 1)} size='icon-sm' variant='outline'>←</Button><span className='text-sm'>{page + 1} / {pageCount}</span><Button aria-label={t('Next page')} disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)} size='icon-sm' variant='outline'>→</Button></div></div>
          {visibleHistory.length ? <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>{visibleHistory.map((record) => <HistoryCard key={record.id} record={record} onDelete={() => void remove(record.id)} onDownload={download} onPreview={setPreview} onReuse={reuse} />)}</div> : <div className='border border-dashed p-8 text-center text-sm text-muted-foreground'>{t('Your generated images will appear here.')}</div>}
        </section>

        <section className='border-t pt-6'>
          <div className='mb-4 flex flex-wrap items-end justify-between gap-3'><div><h2 className='text-lg font-semibold'>{t('Prompt library')}</h2><p className='text-sm text-muted-foreground'>{t('Local prompts for GPT Image 2')}</p></div><div className='flex gap-2'><div className='relative'><Search className='absolute top-2 left-2 size-4 text-muted-foreground' /><Input aria-label={t('Search prompts')} className='w-52 pl-8' onChange={(event) => setQuery(event.target.value)} placeholder={t('Search prompts')} value={query} /></div><select aria-label={t('Filter by tag')} className='h-8 rounded-md border bg-background px-2 text-sm' onChange={(event) => setTag(event.target.value)} value={tag}><option value=''>{t('All tags')}</option>{tags.map((value) => <option key={value}>{value}</option>)}</select></div></div>
          <div className='flex flex-wrap gap-2 pb-4'>{['', ...tags].map((value) => <Button key={value || 'all'} onClick={() => setTag(value)} size='sm' variant={tag === value ? 'secondary' : 'ghost'}>{value || t('All')}</Button>)}</div>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>{prompts.map((item) => <PromptCard key={item.id} item={item} onSelect={setPrompt} />)}</div>
        </section>
      </div>
      {preview ? <PreviewDialog blob={preview} onClose={() => setPreview(undefined)} /> : null}
    </Main>
  )
}

function HistoryCard(props: { record: DrawingHistoryRecord; onDelete: () => void; onDownload: (blob: Blob, name: string) => void; onPreview: (blob: Blob) => void; onReuse: (record: DrawingHistoryRecord) => void }) {
  const { t } = useTranslation()
  return <article className='overflow-hidden rounded-lg border'><div className='grid grid-cols-2 gap-1 p-1'>{props.record.images.map((blob) => <HistoryImage blob={blob} key={`${props.record.id}-${blob.size}-${blob.type}`} onClick={() => props.onPreview(blob)} />)}</div><div className='space-y-2 p-3'><p className='line-clamp-2 text-sm'>{props.record.prompt}</p><p className='text-xs text-muted-foreground'>{props.record.model} · {props.record.size} · {props.record.quality}</p><div className='flex gap-1'><Button onClick={() => props.onReuse(props.record)} size='sm' variant='outline'><RefreshCw />{t('Reuse')}</Button><Button aria-label={t('Download')} onClick={() => props.onDownload(props.record.images[0], `${props.record.id}.png`)} size='icon-sm' variant='ghost'><Download /></Button><Button aria-label={t('Delete')} onClick={props.onDelete} size='icon-sm' variant='ghost'><Trash2 /></Button></div></div></article>
}

function PromptCard(props: { item: DrawingPrompt; onSelect: (prompt: string) => void }) {
  const { t } = useTranslation()
  return <article className='rounded-lg border p-4'><div className='mb-3 flex h-24 items-center justify-center rounded-md bg-muted'><ImageIcon className='size-8 text-muted-foreground' /></div><h3 className='font-medium'>{t(props.item.titleKey)}</h3><p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>{t(props.item.descriptionKey)}</p><div className='mt-3 flex flex-wrap gap-1'>{props.item.tags.map((tag) => <span className='rounded bg-muted px-2 py-0.5 text-xs' key={tag}>{t(tag)}</span>)}</div><Button className='mt-3 w-full' onClick={() => props.onSelect(props.item.prompt)} size='sm' variant='outline'>{t('Use prompt')}</Button></article>
}

function PreviewDialog(props: { blob: Blob; onClose: () => void }) {
  const { t } = useTranslation()
  const url = useBlobUrl(props.blob)
  return <div aria-label={t('Image preview')} aria-modal='true' className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4' role='dialog'><div className='relative max-h-full max-w-4xl'><Button aria-label={t('Close')} className='absolute -top-10 right-0 text-white' onClick={props.onClose} size='icon-sm' variant='ghost'><X /></Button>{url ? <img alt={t('Image preview')} className='max-h-[85vh] max-w-full object-contain' src={url} /> : <Loader2 className='size-8 animate-spin text-white' />}</div></div>
}

import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  createDigitalAsset,
  listDigitalAssetTags,
} from '@/features/digital-assets/api'
import { AssetFormDialog } from '@/features/digital-assets/components/asset-form-dialog'
import type { DigitalAssetFormValues } from '@/features/digital-assets/lib/form'
import type { DigitalAssetTag } from '@/features/digital-assets/types'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'

import {
  getDrawingModels,
  polishDrawingPrompt,
  requestDrawingImages,
  requestMidjourneyImage,
  type ImageGenerationRequest,
} from './api'
import { getDrawingErrorMessage } from './error-message'
import {
  ImagePreviewDialog,
  type ImagePreviewSource,
} from './image-preview-dialog'
import {
  getDrawingModelConfig,
  getFixedOrSelectedValue,
  type DrawingInputConfig,
  type DrawingOperationConfig,
} from './model-config'
import {
  DRAWING_PROMPT_CATEGORIES,
  DRAWING_PROMPT_SCENES,
  DRAWING_PROMPT_STYLES,
  filterDrawingPrompts,
  type DrawingPrompt,
} from './prompts'
import {
  deleteDrawingHistory,
  listDrawingHistory,
  saveDrawingHistory,
  type DrawingHistoryRecord,
} from './storage'
import {
  restoreReferenceImage,
  validateReferenceImage,
  validateReferenceImages,
} from './validation'

type PreviewState = {
  images: ImagePreviewSource[]
  index: number
}

const PAGE_SIZE = 8
const PROMPTS_PER_PAGE = 12

const PROMPT_CATEGORY_LABELS: Record<string, string> = {
  'Architecture & Spaces': '建筑与空间',
  'Brand & Logos': '品牌与标志',
  'Characters & People': '角色与人物',
  'Charts & Infographics': '图表与信息图',
  'Documents & Publishing': '文档与出版',
  'History & Classical Themes': '历史与古典主题',
  'Illustration & Art': '插画与艺术',
  'Other Use Cases': '其他用途',
  'Photography & Realism': '摄影与写实',
  'Posters & Typography': '海报与字体设计',
  'Products & E-commerce': '产品与电商',
  'Scenes & Storytelling': '场景与叙事',
  'UI & Interfaces': 'UI 与界面',
}

const PROMPT_STYLE_LABELS: Record<string, string> = {
  '3D': '3D',
  Architecture: '建筑',
  Brand: '品牌',
  Character: '角色',
  Characters: '人物角色',
  Charts: '图表',
  Classical: '古典',
  Documents: '文档',
  History: '历史',
  Illustration: '插画',
  Infographic: '信息图',
  'Other Use Cases': '其他用途',
  Photography: '摄影',
  Poster: '海报',
  Product: '产品',
  Products: '商品',
  Realistic: '写实',
  Scenes: '场景',
  UI: 'UI',
}

const PROMPT_SCENE_LABELS: Record<string, string> = {
  Commerce: '商业',
  Creative: '创意',
  Education: '教育',
  Fashion: '时尚',
  Food: '美食',
  History: '历史',
  Social: '社交',
  Story: '故事',
  Tech: '科技',
  Travel: '旅行',
}

function DrawingSelect(props: {
  ariaLabel: string
  disabled?: boolean
  onChange: (value: string) => void
  options: string[]
  optionLabels?: Record<string, string>
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
        <SelectValue>
          {props.optionLabels?.[props.value] ?? props.value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {props.options.map((option) => (
            <SelectItem key={option} value={option}>
              {props.optionLabels?.[option] ?? option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
function PromptFilterSelect(props: {
  allLabel: string
  ariaLabel: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
  value: string
}) {
  const allValue = '__all__'
  const selectedLabel =
    props.options.find((option) => option.value === props.value)?.label ??
    props.allLabel
  return (
    <Select
      onValueChange={(value) => {
        if (value) props.onChange(value === allValue ? '' : value)
      }}
      value={props.value || allValue}
    >
      <SelectTrigger aria-label={props.ariaLabel} className='w-full'>
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value={allValue}>{props.allLabel}</SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
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

export function Drawing(props: { initialPrompt?: string }) {
  const { t } = useTranslation()
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState(props.initialPrompt ?? '')
  const [aspectRatio, setAspectRatio] = useState('auto')
  const [resolution, setResolution] = useState('1k')
  const [quality, setQuality] = useState('auto')
  const [count, setCount] = useState(1)
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [referenceError, setReferenceError] = useState('')
  const [referenceValidationPending, setReferenceValidationPending] =
    useState(false)
  const referenceValidationId = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [history, setHistory] = useState<DrawingHistoryRecord[]>([])
  const [historyVisibleCount, setHistoryVisibleCount] = useState(PAGE_SIZE)
  const [query, setQuery] = useState('')
  const [promptCategory, setPromptCategory] = useState('')
  const [promptStyle, setPromptStyle] = useState('')
  const [promptScene, setPromptScene] = useState('')
  const [promptPage, setPromptPage] = useState(1)
  const deferredQuery = useDeferredValue(query)
  const [isGenerating, setIsGenerating] = useState(false)
  const [assetPrompt, setAssetPrompt] = useState<string | null>(null)
  const [assetTags, setAssetTags] = useState<DigitalAssetTag[]>([])
  const [assetSavePending, setAssetSavePending] = useState(false)

  useEffect(() => {
    if (assetPrompt === null) return
    void listDigitalAssetTags()
      .then(setAssetTags)
      .catch((error) => {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : t('Failed to load tags')
        )
      })
  }, [assetPrompt, t])

  const savePromptAsset = async (values: DigitalAssetFormValues) => {
    setAssetSavePending(true)
    try {
      await createDigitalAsset({ ...values, asset_type: 'text' })
      setAssetPrompt(null)
      toast.success(t('Prompt saved to assets'))
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('Failed to save prompt to assets')
      )
      throw error
    } finally {
      setAssetSavePending(false)
    }
  }

  const assetDraft = useMemo(() => {
    if (assetPrompt === null) return undefined
    const compact = assetPrompt.trim().replaceAll(/\s+/g, ' ')
    return {
      title: compact.slice(0, 30),
      content: assetPrompt,
    }
  }, [assetPrompt])
  const [isPolishing, setIsPolishing] = useState(false)
  const [undoPrompt, setUndoPrompt] = useState<string>()
  const polishControllerRef = useRef<AbortController>(null)
  const generationControllerRef = useRef<AbortController>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PreviewState>()
  const [highlightHistoryId, setHighlightHistoryId] = useState<string>()
  const scrollRef = useRef<HTMLElement>(null)
  const historyRef = useRef<HTMLElement>(null)
  const promptLibraryRef = useRef<HTMLElement>(null)

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
    () =>
      filterDrawingPrompts(deferredQuery, {
        category: promptCategory,
        style: promptStyle,
        scene: promptScene,
      }),
    [deferredQuery, promptCategory, promptScene, promptStyle]
  )
  const promptPageCount = Math.max(
    1,
    Math.ceil(prompts.length / PROMPTS_PER_PAGE)
  )
  const visiblePrompts = prompts.slice(
    (promptPage - 1) * PROMPTS_PER_PAGE,
    promptPage * PROMPTS_PER_PAGE
  )
  const visibleHistory = history.slice(0, historyVisibleCount)
  const hasMoreHistory = historyVisibleCount < history.length
  const modelConfig = getDrawingModelConfig(model)
  const isMidjourneyModel = modelConfig?.requestFormat === 'midjourney'
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
    return () => {
      polishControllerRef.current?.abort()
      generationControllerRef.current?.abort()
    }
  }, [])

  const invalidatePromptPolish = () => {
    polishControllerRef.current?.abort()
    polishControllerRef.current = null
    setIsPolishing(false)
    setUndoPrompt(undefined)
  }

  const changePromptInput = (value: string) => {
    invalidatePromptPolish()
    setPrompt(value)
  }

  const polishPrompt = async () => {
    const originalPrompt = prompt.trim()
    if (!originalPrompt || isPolishing) return

    const controller = new AbortController()
    invalidatePromptPolish()
    polishControllerRef.current = controller
    setError('')
    setIsPolishing(true)
    try {
      const polishedPrompt = await polishDrawingPrompt(
        {
          prompt: originalPrompt,
          aspectRatio,
          referenceImages,
          isMidjourney: isMidjourneyModel,
        },
        controller.signal
      )
      if (controller.signal.aborted) return
      setUndoPrompt(originalPrompt)
      setPrompt(polishedPrompt)
    } catch (requestError) {
      if (controller.signal.aborted) return
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('Prompt polishing failed')
      )
    } finally {
      if (polishControllerRef.current === controller) {
        polishControllerRef.current = null
        setIsPolishing(false)
      }
    }
  }

  const submit = async () => {
    if (
      !prompt.trim() ||
      !model ||
      !modelConfig ||
      !activeOperation ||
      referenceValidationPending ||
      referenceError ||
      (referenceImages.length > 0 && !hasEditModel)
    ) {
      return
    }
    setError('')
    setIsGenerating(true)
    const controller = new AbortController()
    generationControllerRef.current = controller
    const aspect = getFixedOrSelectedValue(
      activeOperation.aspectRatios,
      aspectRatio
    )
    const resolutionValue = getFixedOrSelectedValue(
      activeOperation.resolutions,
      resolution
    )
    const size =
      aspect && resolutionValue ? `${aspect} ${resolutionValue}` : undefined
    const qualityValue = getFixedOrSelectedValue(
      activeOperation.qualities,
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
      let images: Blob[]
      if (modelConfig.requestFormat === 'midjourney') {
        const result = await requestMidjourneyImage(
          payload.prompt,
          referenceImages,
          {
            signal: controller.signal,
          }
        )
        images = result.images
        if (result.usedOriginalGrid) {
          toast.warning(
            t(
              'Image splitting failed. The original Midjourney grid was saved instead.'
            )
          )
        }
      } else {
        const response = await requestDrawingImages(
          modelConfig.requestFormat,
          referenceImages.length
            ? { ...payload, images: referenceImages }
            : payload,
          controller.signal
        )
        images = (response.data ?? [])
          .filter((item) => Boolean(item.b64_json))
          .map((item) => {
            const binary = atob(item.b64_json as string)
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
            return new Blob([bytes], { type: item.mime_type || 'image/png' })
          })
      }
      if (controller.signal.aborted) return
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
        n: images.length,
        images,
        referenceImages: [...referenceImages],
      }
      setHistory((current) => [record, ...current])
      setHistoryVisibleCount((current) => Math.max(current, PAGE_SIZE))
      if (!(await saveDrawingHistory(record))) {
        toast.warning(t('This result could not be saved in local history'))
      }
      requestAnimationFrame(() => {
        historyRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
        window.setTimeout(() => setHighlightHistoryId(record.id), 450)
      })
    } catch (requestError) {
      if (controller.signal.aborted) return
      setError(getDrawingErrorMessage(requestError, t))
    } finally {
      if (generationControllerRef.current === controller) {
        generationControllerRef.current = null
        setIsGenerating(false)
      }
    }
  }

  const remove = async (id: string) => {
    await deleteDrawingHistory(id)
    setHistory((current) => current.filter((record) => record.id !== id))
    setHistoryVisibleCount((current) =>
      Math.min(current, Math.max(PAGE_SIZE, history.length - 1))
    )
  }

  const download = (images: Blob[], id: string) => {
    images.forEach((blob, index) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const subtype = blob.type.split('/')[1]?.toLowerCase()
      let extension = 'png'
      if (subtype === 'jpeg') {
        extension = 'jpg'
      } else if (subtype && ['png', 'webp', 'gif'].includes(subtype)) {
        extension = subtype
      }
      link.href = url
      link.download = `${id}-${index + 1}.${extension}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    })
  }

  const reuse = (record: DrawingHistoryRecord) => {
    invalidatePromptPolish()
    setPrompt(record.prompt)
    setModel(record.model)
    const savedSize = record.size.split(' ')
    setAspectRatio(savedSize.length === 2 ? savedSize[0] : 'auto')
    setResolution(savedSize.length === 2 ? savedSize[1] : '1k')
    setQuality(record.quality)
    setCount(record.n)
    const files = (record.referenceImages ?? []).map(restoreReferenceImage)
    setReferenceImages(files)
    setReferenceError('')
    void validateReferences(
      files,
      getDrawingModelConfig(record.model)?.imageToImage?.input
    )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const validateReferences = async (
    files: File[],
    config: DrawingInputConfig | undefined
  ) => {
    const validationId = ++referenceValidationId.current
    if (!files.length) {
      setReferenceValidationPending(false)
      setReferenceError('')
      return
    }
    setReferenceValidationPending(true)
    setReferenceError('')
    const errorKey = await validateReferenceImages(files, config)
    if (validationId !== referenceValidationId.current) return
    setReferenceValidationPending(false)
    if (errorKey) {
      setReferenceError(
        t(
          {
            unsupported: 'Reference image format is not supported.',
            'too-many': 'You can select up to 4 reference images.',
            'too-large': 'Reference images must be 20 MB or smaller in total.',
            'too-wide':
              'Reference image dimensions must be 4096 pixels or smaller.',
          }[errorKey]
        )
      )
    }
  }

  const referenceBytes = referenceImages.reduce(
    (total, file) => total + file.size,
    0
  )

  const addReferenceImages = async (files: FileList | null) => {
    if (!files) return
    invalidatePromptPolish()
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

  useLayoutEffect(() => {
    const textarea = promptInputRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [prompt])

  const selectPrompt = (value: string) => {
    invalidatePromptPolish()
    setPrompt(value)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    requestAnimationFrame(() => promptInputRef.current?.focus())
  }

  const changePromptPage = (page: number) => {
    setPromptPage(page)
    promptLibraryRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <Main ref={scrollRef} className='relative overflow-y-auto p-4 md:p-6'>
      <FormNavigationGuard
        message={t(
          'A drawing task is still running. Leaving this page may cause the task result to be lost. Are you sure you want to leave?'
        )}
        title={t('Drawing generation in progress')}
        when={isGenerating}
      />
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
          <div className='bg-background focus-within:border-primary/50 focus-within:ring-primary/15 relative mx-auto flex min-h-[160px] w-full flex-col rounded-lg border p-3 transition-colors focus-within:ring-2'>
            <textarea
              aria-label={t('Prompt word')}
              className='max-h-[45dvh] min-h-[104px] w-full resize-none overflow-y-auto bg-transparent outline-none'
              disabled={isGenerating}
              onChange={(event) => changePromptInput(event.target.value)}
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
            <div className='mt-2 flex min-h-10 flex-wrap items-end justify-between gap-3 pt-2'>
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
                    onDelete={() => {
                      invalidatePromptPolish()
                      setReferenceImages((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }}
                    onPreview={() => setPreview({ images: [file], index: 0 })}
                  />
                ))}
              </div>
              <div className='flex shrink-0 items-center gap-2'>
                {undoPrompt !== undefined ? (
                  <Button
                    onClick={() => {
                      setPrompt(undoPrompt)
                      setUndoPrompt(undefined)
                    }}
                    size='sm'
                    type='button'
                    variant='ghost'
                  >
                    <Undo2 />
                    {t('Undo polish')}
                  </Button>
                ) : null}
                <Button
                  disabled={!prompt.trim() || isGenerating || isPolishing}
                  onClick={() => void polishPrompt()}
                  size='sm'
                  type='button'
                  variant='ghost'
                >
                  {isPolishing ? (
                    <Loader2 className='animate-spin' />
                  ) : (
                    <Sparkles />
                  )}
                  {isPolishing ? t('Polishing...') : t('Polish')}
                </Button>
                <Button
                  aria-label={isGenerating ? t('Generating...') : t('Generate')}
                  className='size-11 shrink-0 rounded-full'
                  disabled={
                    isGenerating ||
                    isPolishing ||
                    referenceValidationPending ||
                    Boolean(referenceError) ||
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
          </div>
          {referenceError ? (
            <p className='text-destructive mt-2 text-sm' role='alert'>
              {referenceError}
            </p>
          ) : null}
          <div className='mt-4 grid gap-4 sm:grid-cols-5'>
            <label className='space-y-1.5 text-sm'>
              <span>{t('Image model')}</span>
              <DrawingSelect
                ariaLabel={t('Image model')}
                disabled={!models.length}
                onChange={(nextModel) => {
                  invalidatePromptPolish()
                  setModel(nextModel)
                  setReferenceError('')
                  void validateReferences(
                    referenceImages,
                    getDrawingModelConfig(nextModel)?.imageToImage?.input
                  )
                }}
                options={models}
                value={model}
              />
            </label>
            {activeOperation?.aspectRatios?.length ? (
              <label className='space-y-1.5 text-sm'>
                <span>{t('Aspect ratio')}</span>
                <DrawingSelect
                  ariaLabel={t('Aspect ratio')}
                  disabled={activeOperation.aspectRatios.length === 1}
                  onChange={(value) => {
                    invalidatePromptPolish()
                    setAspectRatio(value)
                  }}
                  options={activeOperation.aspectRatios}
                  value={aspectRatio}
                />
              </label>
            ) : null}
            {activeOperation?.resolutions?.length ? (
              <label className='space-y-1.5 text-sm'>
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
              <label className='space-y-1.5 text-sm'>
                <span>{t('Quality')}</span>
                <DrawingSelect
                  ariaLabel={t('Quality')}
                  disabled={activeOperation.qualities.length === 1}
                  onChange={setQuality}
                  optionLabels={
                    model === 'gpt-image-2'
                      ? {
                          low: t('Standard quality'),
                          medium: t('Higher quality'),
                        }
                      : undefined
                  }
                  options={activeOperation.qualities}
                  value={quality}
                />
              </label>
            ) : null}
            {activeOperation ? (
              <label className='space-y-1.5 text-sm'>
                <span>{t('Images')}</span>
                {isMidjourneyModel ? (
                  <DrawingSelect
                    ariaLabel={t('Images')}
                    disabled
                    onChange={() => {}}
                    options={[t('One set (4 images)')]}
                    value={t('One set (4 images)')}
                  />
                ) : (
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
                )}
              </label>
            ) : null}
          </div>
          {isMidjourneyModel ? (
            <p className='text-destructive mt-3 flex items-center gap-1 text-sm'>
              <span>MJ模型新手慎用。所有参数体现在提示词中</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        aria-label='查看 MJ 参数说明'
                        className='inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full'
                        type='button'
                      />
                    }
                  >
                    <Info className='size-4' />
                  </TooltipTrigger>
                  <TooltipContent
                    align='start'
                    className='max-w-sm whitespace-pre-line'
                  >
                    {
                      '--v：模型版本，7 / 8.1 / 8.2\n--ar：画面比例，1:1 / 16:9 / 2:3 / 9:16 等\n--q：渲染质量，0.25 / 0.5 / 1 / 2\n--hd：HD 高清（仅 v8.1 / v8.2）\n--style：风格：“raw”等\n--s：风格化强度，0–1000\n--c：混乱度，0–100\n--w：怪异度，0–3000\n--iw：图片权重，0–3\n--cw：角色权重，0–100\n--sw：风格权重，0–1000\n--seed：固定种子'
                    }
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </p>
          ) : null}
          {isGenerating ? (
            <p
              className='text-destructive mt-3 text-sm motion-safe:animate-pulse'
              role='status'
            >
              {t(
                'A task is in progress. Do not refresh or close this page, or the task will be cancelled and charged normally.'
              )}
            </p>
          ) : null}
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

        <section ref={historyRef}>
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
                  highlight={record.id === highlightHistoryId}
                  key={record.id}
                  record={record}
                  onDelete={() => void remove(record.id)}
                  onDownload={download}
                  onPreview={(images, index) => setPreview({ images, index })}
                  onReuse={reuse}
                  onSavePrompt={() => setAssetPrompt(record.prompt)}
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

        <section className='pt-6' ref={promptLibraryRef}>
          <div className='mb-4 flex flex-col gap-3'>
            <h2 className='text-lg font-semibold'>{t('Prompt library')}</h2>
            <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
              <div className='relative'>
                <Search className='text-muted-foreground absolute top-2 left-2 size-4' />
                <Input
                  aria-label={t('Search prompts')}
                  className='w-full pl-8'
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPromptPage(1)
                  }}
                  placeholder={t('Search prompts')}
                  value={query}
                />
              </div>
              <PromptFilterSelect
                allLabel='全部分类'
                ariaLabel='分类'
                onChange={(value) => {
                  setPromptCategory(value)
                  setPromptPage(1)
                }}
                options={DRAWING_PROMPT_CATEGORIES.map((value) => ({
                  label: PROMPT_CATEGORY_LABELS[value] ?? value,
                  value,
                }))}
                value={promptCategory}
              />
              <PromptFilterSelect
                allLabel='全部风格'
                ariaLabel='风格'
                onChange={(value) => {
                  setPromptStyle(value)
                  setPromptPage(1)
                }}
                options={DRAWING_PROMPT_STYLES.map((value) => ({
                  label: PROMPT_STYLE_LABELS[value] ?? value,
                  value,
                }))}
                value={promptStyle}
              />
              <PromptFilterSelect
                allLabel='全部场景'
                ariaLabel='场景'
                onChange={(value) => {
                  setPromptScene(value)
                  setPromptPage(1)
                }}
                options={DRAWING_PROMPT_SCENES.map((value) => ({
                  label: PROMPT_SCENE_LABELS[value] ?? value,
                  value,
                }))}
                value={promptScene}
              />
            </div>
          </div>
          <PromptGrid
            onSelect={selectPrompt}
            onPreview={(url: string) => setPreview({ images: [url], index: 0 })}
            prompts={visiblePrompts}
          />
          {prompts.length > PROMPTS_PER_PAGE ? (
            <div className='mt-5 flex items-center justify-center gap-3'>
              <Button
                aria-label={t('Previous page')}
                disabled={promptPage === 1}
                onClick={() => changePromptPage(promptPage - 1)}
                size='icon-sm'
                variant='outline'
              >
                <ChevronLeft />
              </Button>
              <span className='text-muted-foreground min-w-16 text-center text-sm tabular-nums'>
                {promptPage} / {promptPageCount}
              </span>
              <Button
                aria-label={t('Next page')}
                disabled={promptPage === promptPageCount}
                onClick={() => changePromptPage(promptPage + 1)}
                size='icon-sm'
                variant='outline'
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </section>
      </div>
      <AssetFormDialog
        open={assetPrompt !== null}
        asset={null}
        initialPrompt={assetDraft}
        availableTags={assetTags}
        deletedTag={null}
        pending={assetSavePending}
        onOpenChange={(open) => {
          if (!open) setAssetPrompt(null)
        }}
        onManageTags={() => undefined}
        onSubmit={savePromptAsset}
      />
      {preview ? (
        <ImagePreviewDialog
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
  highlight?: boolean
  onDelete: () => void
  onDownload: (images: Blob[], id: string) => void
  onPreview: (images: Blob[], index: number) => void
  onReuse: (record: DrawingHistoryRecord) => void
  onSavePrompt: () => void
}) {
  const { t } = useTranslation()
  return (
    <article className='overflow-hidden rounded-lg border'>
      <div className='relative overflow-hidden p-1'>
        {props.highlight ? (
          <span aria-hidden='true' className='history-sweep' />
        ) : null}
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('Save prompt to assets')}
                    onClick={props.onSavePrompt}
                    size='icon-sm'
                    variant='ghost'
                  />
                }
              >
                <Archive />
              </TooltipTrigger>
              <TooltipContent>{t('Save prompt to assets')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('Download')}
                    onClick={() =>
                      props.onDownload(props.record.images, props.record.id)
                    }
                    size='icon-sm'
                    variant='ghost'
                  />
                }
              >
                <Download />
              </TooltipTrigger>
              <TooltipContent>{t('Download')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('Delete')}
                    onClick={props.onDelete}
                    size='icon-sm'
                    variant='ghost'
                  />
                }
              >
                <Trash2 />
              </TooltipTrigger>
              <TooltipContent>{t('Delete')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </article>
  )
}

function PromptGrid(props: {
  prompts: DrawingPrompt[]
  onSelect: (prompt: string) => void
  onPreview: (url: string) => void
}) {
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {props.prompts.map((item) => (
        <PromptCard
          key={item.id}
          item={item}
          onPreview={props.onPreview}
          onSelect={props.onSelect}
        />
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
      <div className='flex min-h-12 items-start justify-between gap-2'>
        <h3 className='line-clamp-2 font-medium'>{props.item.title}</h3>
        <a
          aria-label={`${props.item.sourceLabel}: ${props.item.title}`}
          className='text-muted-foreground hover:text-foreground shrink-0'
          href={props.item.sourceUrl || props.item.githubUrl}
          rel='noreferrer'
          target='_blank'
        >
          <ExternalLink className='size-4' />
        </a>
      </div>
      <p className='text-muted-foreground mt-1 line-clamp-3 min-h-15 text-sm'>
        {props.item.description || props.item.prompt}
      </p>
      <div className='mt-3 flex max-h-7 min-h-7 flex-wrap gap-1 overflow-hidden'>
        <span className='bg-muted inline-flex h-6 items-center rounded px-2 text-xs'>
          {PROMPT_CATEGORY_LABELS[props.item.category] ?? props.item.category}
        </span>
        {props.item.styles.map((style) => (
          <span
            className='bg-muted inline-flex h-6 items-center rounded px-2 text-xs'
            key={`style:${style}`}
          >
            {PROMPT_STYLE_LABELS[style] ?? style}
          </span>
        ))}
        {props.item.scenes.map((scene) => (
          <span
            className='bg-muted inline-flex h-6 items-center rounded px-2 text-xs'
            key={`scene:${scene}`}
          >
            {PROMPT_SCENE_LABELS[scene] ?? scene}
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

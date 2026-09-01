import {
  Download,
  Eye,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
  getDrawingModels,
  requestDrawingImages,
  type ImageGenerationRequest,
} from '@/features/drawing/api'
import { ImagePreviewDialog } from '@/features/drawing/image-preview-dialog'
import { getDrawingModelConfig } from '@/features/drawing/model-config'
import { validateReferenceImages } from '@/features/drawing/validation'
import { cn } from '@/lib/utils'

import {
  applyCategoryChange,
  applyPurposeChange,
  CHANNEL_OPTIONS,
  compileEcommercePrompt,
  COMPOSITION_OPTIONS,
  createDefaultDraft,
  DETAIL_OPTIONS,
  FOCUS_OPTIONS,
  getReferenceImages,
  getVisibleFocuses,
  PERSON_SCENE_OPTIONS,
  POSE_OPTIONS,
  PRESENTATION_OPTIONS,
  PURPOSE_OPTIONS,
  SCENE_OPTIONS,
  SET_SCOPE_OPTIONS,
  STYLE_OPTIONS,
  validateStep,
} from './prompt-compiler'
import {
  clearEcommerceDraft,
  deleteEcommerceHistory,
  listEcommerceHistory,
  loadEcommerceDraft,
  saveEcommerceDraft,
  saveEcommerceHistory,
  type EcommerceHistoryRecord,
} from './storage'
import type {
  DraftErrors,
  EcommerceDraft,
  GenerationSettings,
  Option,
  Purpose,
  ReferenceRole,
  StepNumber,
} from './types'

const MODEL = 'gpt-image-2'
const DEFAULT_SETTINGS: GenerationSettings = {
  aspectRatio: '1:1',
  resolution: '1k',
  quality: 'medium',
}
const STEP_TITLES = [
  '这张图主要要帮顾客完成什么？',
  '商品信息',
  '你希望商品怎么出现？',
  '这张图最想突出什么？',
  '风格与构图',
] as const
const REQUIRED_STEPS = new Set<StepNumber>([1, 3, 4, 5])
const REFERENCE_LABELS: Record<ReferenceRole, string> = {
  productImage: '商品图',
  sceneImage: '场景参考图',
  personImage: '人物参考图',
  personSceneImage: '人物场景参考图',
  styleImage: '风格参考图',
}
const QUALITY_OPTIONS: Option<string>[] = [
  { value: 'low', label: '低质量' },
  { value: 'medium', label: '中等质量' },
  { value: 'high', label: '高质量' },
]
const REFERENCE_ERROR_TEXT = {
  unsupported: '图片格式或内容不受支持',
  'too-many': '参考图数量超过上限',
  'too-large': '图片文件大小超过上限',
  'too-wide': '图片像素尺寸超过上限',
} as const
type PreviewState = { blob: Blob; index: number; recordId: string }

function RequiredMark() {
  return (
    <span aria-hidden='true' className='text-destructive ml-0.5'>
      *
    </span>
  )
}

function SelectField<T extends string>(props: {
  id?: string
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const selectedLabel =
    props.options.find((option) => option.value === props.value)?.label ??
    props.value
  return (
    <div className='grid gap-1.5 text-sm'>
      <label className='font-medium' htmlFor={props.id}>
        {t(props.label)}
      </label>
      <Select
        disabled={props.disabled}
        onValueChange={(value) => value && props.onChange(value as T)}
        value={props.value}
      >
        <SelectTrigger className='w-full rounded-none' id={props.id}>
          <SelectValue>{t(selectedLabel)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ChoiceGrid<T extends string>(props: {
  legend: string
  name: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className='sr-only'>{t(props.legend)}</legend>
      <div className='grid gap-2 sm:grid-cols-2'>
        {props.options.map((option) => {
          const selected = option.value === props.value
          return (
            <label
              className={cn(
                'bg-background flex min-h-11 cursor-pointer items-center border px-3 py-2 text-sm',
                selected && 'border-primary bg-primary/10 ring-primary ring-1'
              )}
              key={option.value}
            >
              <input
                checked={selected}
                className='mr-2'
                name={props.name}
                onChange={() => props.onChange(option.value)}
                type='radio'
                value={option.value}
              />
              {t(option.label)}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function FieldError(props: { message?: string }) {
  const { t } = useTranslation()
  return props.message ? (
    <p className='text-destructive text-sm' role='alert'>
      {t(props.message)}
    </p>
  ) : null
}

function StepSection(props: {
  number: StepNumber
  unlockedStep: StepNumber
  onNext: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const completed = props.number < props.unlockedStep
  return (
    <section
      aria-labelledby={`ecommerce-step-${props.number}`}
      className='bg-background border'
      data-step={props.number}
    >
      <div className='p-4'>
        <div className='flex items-center justify-between gap-3'>
          <h2
            className='text-base font-semibold'
            id={`ecommerce-step-${props.number}`}
          >
            {props.number}. {t(STEP_TITLES[props.number - 1])}
            {REQUIRED_STEPS.has(props.number) ? <RequiredMark /> : null}
          </h2>
          <span className='text-muted-foreground text-xs'>
            {completed ? t('已完成') : t('进行中')}
          </span>
        </div>
      </div>
      <div className='grid gap-4 p-4'>{props.children}</div>
      {props.number < 5 && props.number === props.unlockedStep ? (
        <div className='border-t p-4'>
          <Button
            className='w-28 rounded-none'
            onClick={props.onNext}
            type='button'
          >
            {t('下一步')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function UploadField(props: {
  role: ReferenceRole
  file: File | null
  disabled?: boolean
  error?: string
  onFile: (role: ReferenceRole, file: File | null) => void
}) {
  const { t } = useTranslation()
  const id = `ecommerce-${props.role}`
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrl = useBlobUrl(props.file ?? undefined)
  return (
    <div className='grid gap-1.5'>
      <span className='text-sm font-medium'>
        {t(REFERENCE_LABELS[props.role])}
      </span>
      <input
        accept='image/jpeg,image/png,image/webp'
        aria-invalid={Boolean(props.error)}
        className='hidden'
        disabled={props.disabled}
        id={id}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          void props.onFile(props.role, file)
          event.target.value = ''
        }}
        ref={inputRef}
        type='file'
      />
      <div className='flex min-w-0 items-center gap-2'>
        <Button
          aria-label={t('Add reference images')}
          className='size-10 rounded-none'
          disabled={props.disabled}
          onClick={() => inputRef.current?.click()}
          size='icon'
          type='button'
          variant='outline'
        >
          <Plus />
        </Button>
        {props.file ? (
          <div className='relative size-10 shrink-0'>
            <div className='size-full overflow-hidden border'>
              {previewUrl ? (
                <img
                  alt=''
                  className='size-full object-cover'
                  src={previewUrl}
                />
              ) : null}
            </div>
            <button
              aria-label={t('移除图片')}
              className='bg-background absolute -top-2 -right-2 rounded-full border p-0.5'
              onClick={() => props.onFile(props.role, null)}
              type='button'
            >
              <X className='size-3' />
            </button>
          </div>
        ) : null}
      </div>
      <FieldError message={props.error} />
    </div>
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

function HistoryImage(props: { blob: Blob; onPreview: () => void }) {
  const { t } = useTranslation()
  const url = useBlobUrl(props.blob)
  return (
    <button
      aria-label={t('查看大图')}
      className='bg-muted aspect-square w-full overflow-hidden border'
      onClick={props.onPreview}
      type='button'
    >
      {url ? (
        <img
          alt={t('生成的电商图片')}
          className='size-full object-cover'
          src={url}
        />
      ) : null}
    </button>
  )
}

export function EcommerceDrawing() {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<EcommerceDraft>(createDefaultDraft)
  const [unlockedStep, setUnlockedStep] = useState<StepNumber>(1)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [referenceErrors, setReferenceErrors] = useState<
    Partial<Record<ReferenceRole, string>>
  >({})
  const [referenceValidationPending, setReferenceValidationPending] =
    useState(false)
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [modelAvailable, setModelAvailable] = useState(false)
  const [history, setHistory] = useState<EcommerceHistoryRecord[]>([])
  const [preview, setPreview] = useState<PreviewState>()
  const [highlightId, setHighlightId] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const historyRef = useRef<HTMLElement>(null)
  const referenceValidationId = useRef(0)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const prompt = useMemo(() => compileEcommercePrompt(draft), [draft])
  const modelConfig = getDrawingModelConfig(MODEL)
  const operation = getReferenceImages(draft).length
    ? modelConfig?.imageToImage
    : modelConfig?.textToImage

  useEffect(() => {
    let active = true
    void Promise.all([
      getDrawingModels(),
      listEcommerceHistory(),
      loadEcommerceDraft(),
    ]).then(async ([models, savedHistory, savedDraft]) => {
      if (!active) return
      setModelAvailable(models.includes(MODEL))
      setModelsLoaded(true)
      setHistory(savedHistory)
      if (savedDraft) {
        const restoredFiles = getReferenceImages(savedDraft.draft)
        const validationError = await validateReferenceImages(
          restoredFiles,
          modelConfig?.imageToImage?.input
        )
        if (!active) return
        if (validationError) {
          toast.warning(t('草稿中的参考图不再符合当前限制，请重新上传'))
        } else {
          setDraft(savedDraft.draft)
          setUnlockedStep(savedDraft.unlockedStep)
          setSettings({
            ...savedDraft.settings,
            quality:
              savedDraft.settings.quality === 'auto'
                ? 'low'
                : savedDraft.settings.quality,
          })
          toast.info(t('已恢复上次草稿'))
        }
      }
      setHydrated(true)
    })
    return () => {
      active = false
    }
  }, [modelConfig?.imageToImage?.input, t])

  useEffect(() => {
    if (!hydrated) return
    const timeout = window.setTimeout(() => {
      void saveEcommerceDraft({ draft, unlockedStep, settings })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [draft, hydrated, settings, unlockedStep])

  const updateDraft = useCallback(
    <K extends keyof EcommerceDraft>(key: K, value: EcommerceDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }))
      setErrors((current) => ({ ...current, [key]: undefined }))
      setRequestError('')
    },
    []
  )

  const unlockNext = (step: StepNumber) => {
    const nextErrors = validateStep(draft, step)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setUnlockedStep((current) => Math.max(current, step + 1) as StepNumber)
  }

  const changeFile = async (role: ReferenceRole, file: File | null) => {
    const validationId = ++referenceValidationId.current
    const nextDraft = { ...draftRef.current, [role]: file }
    if (role === 'styleImage' && file) nextDraft.style = 'none'
    if (!file) {
      setReferenceValidationPending(false)
      setDraft(nextDraft)
      setReferenceErrors((current) => ({ ...current, [role]: undefined }))
      return
    }
    setReferenceValidationPending(true)
    const validationError = await validateReferenceImages(
      getReferenceImages(nextDraft),
      modelConfig?.imageToImage?.input
    )
    setReferenceValidationPending(false)
    if (validationId !== referenceValidationId.current) return
    if (validationError) {
      setReferenceErrors((current) => ({
        ...current,
        [role]: REFERENCE_ERROR_TEXT[validationError],
      }))
      return
    }
    setReferenceErrors((current) => ({ ...current, [role]: undefined }))
    setDraft(nextDraft)
  }

  const reset = async () => {
    await clearEcommerceDraft()
    setDraft(createDefaultDraft())
    setUnlockedStep(1)
    setSettings(DEFAULT_SETTINGS)
    setErrors({})
    setReferenceErrors({})
    setRequestError('')
  }

  const generate = async () => {
    if (
      isGenerating ||
      unlockedStep < 5 ||
      !modelAvailable ||
      !operation ||
      referenceValidationPending ||
      Object.values(referenceErrors).some(Boolean)
    ) {
      return
    }
    for (let step = 1 as StepNumber; step <= 5; step += 1) {
      const nextErrors = validateStep(draft, step)
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors)
        setUnlockedStep((current) => Math.max(current, step) as StepNumber)
        return
      }
    }
    setIsGenerating(true)
    setRequestError('')
    const payload: ImageGenerationRequest = {
      model: MODEL,
      prompt,
      size: `${settings.aspectRatio} ${settings.resolution}`,
      quality: settings.quality,
      n: 1,
      response_format: 'b64_json',
    }
    try {
      const references = getReferenceImages(draft)
      const response = await requestDrawingImages(
        'openai-image',
        references.length ? { ...payload, images: references } : payload
      )
      const images = (response.data ?? []).flatMap((item) => {
        if (!item.b64_json) return []
        const bytes = Uint8Array.from(atob(item.b64_json), (character) =>
          character.charCodeAt(0)
        )
        return [new Blob([bytes], { type: item.mime_type || 'image/png' })]
      })
      if (!images.length) throw new Error(t('图片响应中没有可用图片'))
      const record: EcommerceHistoryRecord = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        images,
      }
      setHistory((current) => [record, ...current])
      setHighlightId(record.id)
      if (await saveEcommerceHistory(record)) {
        setHistory(await listEcommerceHistory())
      } else {
        toast.warning(t('本次结果未能保存到本地历史'))
      }
      requestAnimationFrame(() => {
        historyRef.current?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'start',
        })
      })
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : t('图片生成失败')
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const removeHistory = async (id: string) => {
    await deleteEcommerceHistory(id)
    setHistory((current) => current.filter((record) => record.id !== id))
  }

  const download = (blob: Blob, id: string, index: number) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ecommerce-${id}-${index + 1}.png`
    link.click()
    URL.revokeObjectURL(url)
  }

  const generationPanelProps = {
    canGenerate: unlockedStep >= 5,
    error: requestError,
    isGenerating,
    modelAvailable,
    modelsLoaded,
    onGenerate: () => void generate(),
    onSettings: setSettings,
    prompt,
    promptVisible: unlockedStep > 1,
    settings,
  }

  return (
    <Main className='relative overflow-y-auto p-4 pb-24 md:p-6 md:pb-6'>
      <div className='mx-auto w-full max-w-7xl'>
        <header className='mb-6'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <h1 className='text-2xl font-bold'>{t('电商作图')}</h1>
            <Button
              className='rounded-none'
              onClick={() => void reset()}
              type='button'
              variant='outline'
            >
              <RotateCcw />
              {t('恢复默认')}
            </Button>
          </div>
        </header>

        <div className='grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_360px]'>
          <div className='grid min-w-0 gap-4'>
            <StepSection
              number={1}
              onNext={() => unlockNext(1)}
              unlockedStep={unlockedStep}
            >
              <ChoiceGrid
                legend='这张图主要要帮顾客完成什么？'
                name='ecommerce-purpose'
                onChange={(purpose) => {
                  setDraft((current) => applyPurposeChange(current, purpose))
                  setErrors({})
                }}
                options={PURPOSE_OPTIONS}
                value={draft.purpose}
              />
              {draft.purpose === 'custom' ? (
                <label className='grid gap-1.5 text-sm'>
                  <span className='font-medium'>
                    {t('用一句话说说你想表达什么')}
                    <RequiredMark />
                  </span>
                  <Input
                    aria-invalid={Boolean(errors.customPurpose)}
                    className='rounded-none'
                    onChange={(event) =>
                      updateDraft('customPurpose', event.target.value)
                    }
                    placeholder={t('例如：让人觉得这个包很适合通勤')}
                    value={draft.customPurpose}
                  />
                  <FieldError message={errors.customPurpose} />
                </label>
              ) : null}
            </StepSection>

            {unlockedStep >= 2 ? (
              <StepSection
                number={2}
                onNext={() => unlockNext(2)}
                unlockedStep={unlockedStep}
              >
                <div className='grid gap-4 sm:grid-cols-2'>
                  <label className='grid gap-1.5 text-sm'>
                    <span className='font-medium'>
                      {t('商品名称')}
                      <RequiredMark />
                    </span>
                    <Input
                      aria-invalid={Boolean(errors.name)}
                      className='rounded-none'
                      id='ecommerce-name'
                      onChange={(event) =>
                        updateDraft('name', event.target.value)
                      }
                      value={draft.name}
                    />
                    <FieldError message={errors.name} />
                  </label>
                  <label className='grid gap-1.5 text-sm'>
                    <span className='font-medium'>{t('商品类别')}</span>
                    <Input
                      className='rounded-none'
                      onChange={(event) =>
                        setDraft((current) =>
                          applyCategoryChange(current, event.target.value)
                        )
                      }
                      placeholder={t('如：保温杯、连衣裙、香薰')}
                      value={draft.category}
                    />
                  </label>
                </div>
                <UploadField
                  error={referenceErrors.productImage}
                  file={draft.productImage}
                  onFile={changeFile}
                  role='productImage'
                />
                {!draft.productImage ? (
                  <p className='text-warning text-sm' role='status'>
                    {t('未上传商品图，将根据文字描述生成概念商品图')}
                  </p>
                ) : null}
                <label className='grid gap-1.5 text-sm'>
                  <span className='font-medium'>{t('已知商品事实')}</span>
                  <Textarea
                    className='min-h-24 rounded-none'
                    onChange={(event) =>
                      updateDraft('facts', event.target.value)
                    }
                    placeholder={t(
                      '颜色、材质、包装文字、包含物、数量、尺寸等'
                    )}
                    value={draft.facts}
                  />
                </label>
              </StepSection>
            ) : null}

            {unlockedStep >= 3 ? (
              <StepSection
                number={3}
                onNext={() => unlockNext(3)}
                unlockedStep={unlockedStep}
              >
                <ChoiceGrid
                  legend='你希望商品怎么出现？'
                  name='ecommerce-presentation'
                  onChange={(presentation) =>
                    updateDraft('presentation', presentation)
                  }
                  options={PRESENTATION_OPTIONS}
                  value={draft.presentation}
                />
                {draft.presentation === 'scene' ? (
                  <div className='grid gap-4 border-t pt-4 sm:grid-cols-2'>
                    <SelectField
                      label='场景类型'
                      onChange={(value) => updateDraft('sceneType', value)}
                      options={SCENE_OPTIONS}
                      value={draft.sceneType}
                    />
                    <UploadField
                      error={referenceErrors.sceneImage}
                      file={draft.sceneImage}
                      onFile={changeFile}
                      role='sceneImage'
                    />
                  </div>
                ) : null}
                {draft.presentation === 'person' ? (
                  <div className='grid gap-4 border-t pt-4'>
                    <div className='grid gap-4 sm:grid-cols-2'>
                      <SelectField
                        label='人物动作'
                        onChange={(value) => updateDraft('pose', value)}
                        options={POSE_OPTIONS}
                        value={draft.pose}
                      />
                      <UploadField
                        error={referenceErrors.personImage}
                        file={draft.personImage}
                        onFile={changeFile}
                        role='personImage'
                      />
                    </div>
                    <label className='flex items-center gap-2 text-sm'>
                      <input
                        checked={draft.personScene}
                        onChange={(event) =>
                          updateDraft('personScene', event.target.checked)
                        }
                        type='checkbox'
                      />
                      {t('让人物出现在具体场景中')}
                    </label>
                    {draft.personScene ? (
                      <div className='grid gap-4 sm:grid-cols-2'>
                        <SelectField
                          label='人物场景类型'
                          onChange={(value) =>
                            updateDraft('personSceneType', value)
                          }
                          options={PERSON_SCENE_OPTIONS}
                          value={draft.personSceneType}
                        />
                        <UploadField
                          error={referenceErrors.personSceneImage}
                          file={draft.personSceneImage}
                          onFile={changeFile}
                          role='personSceneImage'
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {draft.presentation === 'set' ? (
                  <div className='grid gap-4 border-t pt-4'>
                    <ChoiceGrid
                      legend='展示范围'
                      name='ecommerce-set-scope'
                      onChange={(value) => updateDraft('setScope', value)}
                      options={SET_SCOPE_OPTIONS}
                      value={draft.setScope}
                    />
                    {draft.setScope === 'named' ? (
                      <label className='grid gap-1.5 text-sm'>
                        <span className='font-medium'>
                          {t('请写出指定配件')}
                          <RequiredMark />
                        </span>
                        <Input
                          aria-invalid={Boolean(errors.namedAccessory)}
                          className='rounded-none'
                          onChange={(event) =>
                            updateDraft('namedAccessory', event.target.value)
                          }
                          placeholder={t('如：杯盖、充电线')}
                          value={draft.namedAccessory}
                        />
                        <FieldError message={errors.namedAccessory} />
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </StepSection>
            ) : null}

            {unlockedStep >= 4 ? (
              <StepSection
                number={4}
                onNext={() => unlockNext(4)}
                unlockedStep={unlockedStep}
              >
                <ChoiceGrid
                  legend='这张图最想突出什么？'
                  name='ecommerce-focus'
                  onChange={(focus) => updateDraft('focus', focus)}
                  options={FOCUS_OPTIONS.filter((option) =>
                    getVisibleFocuses(draft.category).includes(option.value)
                  )}
                  value={draft.focus}
                />
                {draft.focus === 'selling' ? (
                  <label className='grid gap-1.5 text-sm'>
                    <span className='font-medium'>
                      {t('请用一句话写出卖点')}
                      <RequiredMark />
                    </span>
                    <Input
                      aria-invalid={Boolean(errors.sellingPoint)}
                      className='rounded-none'
                      onChange={(event) =>
                        updateDraft('sellingPoint', event.target.value)
                      }
                      placeholder={t('如：轻便，出门携带不占空间')}
                      value={draft.sellingPoint}
                    />
                    <FieldError message={errors.sellingPoint} />
                  </label>
                ) : null}
                {draft.purpose === 'detail' ? (
                  <SelectField
                    label='详情图说明什么'
                    onChange={(value) => updateDraft('detailType', value)}
                    options={DETAIL_OPTIONS}
                    value={draft.detailType}
                  />
                ) : null}
              </StepSection>
            ) : null}

            {unlockedStep >= 5 ? (
              <StepSection
                number={5}
                onNext={() => undefined}
                unlockedStep={unlockedStep}
              >
                <div className='grid gap-4 sm:grid-cols-2'>
                  <SelectField
                    disabled={Boolean(draft.styleImage)}
                    label='视觉风格'
                    onChange={(style) =>
                      setDraft((current) => ({
                        ...current,
                        style,
                        styleImage:
                          style === 'none' ? current.styleImage : null,
                      }))
                    }
                    options={STYLE_OPTIONS}
                    value={draft.style}
                  />
                  <UploadField
                    disabled={draft.style !== 'none'}
                    error={referenceErrors.styleImage}
                    file={draft.styleImage}
                    onFile={changeFile}
                    role='styleImage'
                  />
                </div>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <SelectField
                    label='构图'
                    onChange={(value) => updateDraft('composition', value)}
                    options={COMPOSITION_OPTIONS}
                    value={draft.composition}
                  />
                  <SelectField
                    label='图片用途'
                    onChange={(value) => updateDraft('channel', value)}
                    options={CHANNEL_OPTIONS}
                    value={draft.channel}
                  />
                </div>
                {(draft.channel === 'listing' &&
                  (['use', 'model', 'detail'] as Purpose[]).includes(
                    draft.purpose
                  )) ||
                (draft.channel === 'listing' &&
                  ['scene', 'person'].includes(draft.presentation)) ? (
                  <p className='text-warning text-sm' role='status'>
                    {t(
                      '当前组合更适合详情页；用于主图时会减少场景干扰并放大商品主体'
                    )}
                  </p>
                ) : null}
                <label className='grid gap-1.5 text-sm'>
                  <span className='font-medium'>{t('画面文字')}</span>
                  <Input
                    className='rounded-none'
                    onChange={(event) =>
                      updateDraft('copy', event.target.value)
                    }
                    placeholder={t('短标题或卖点')}
                    value={draft.copy}
                  />
                </label>
              </StepSection>
            ) : null}
          </div>

          <aside className='sticky top-4 hidden md:block'>
            <GenerationPanel idPrefix='desktop' {...generationPanelProps} />
          </aside>
        </div>

        <section className='mt-8 scroll-mt-4' ref={historyRef}>
          <div className='mb-4'>
            <h2 className='text-xl font-semibold'>{t('绘图历史')}</h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('结果仅保存在当前浏览器，请及时下载')}
            </p>
          </div>
          {history.length ? (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              {history.map((record) => (
                <article
                  className={cn(
                    'bg-background border p-3',
                    highlightId === record.id &&
                      'border-primary ring-primary ring-2'
                  )}
                  key={record.id}
                >
                  <div className='grid gap-2'>
                    <HistoryImage
                      blob={record.images[0]}
                      onPreview={() =>
                        setPreview({
                          blob: record.images[0],
                          index: 0,
                          recordId: record.id,
                        })
                      }
                    />
                  </div>
                  <div className='mt-3 flex items-center justify-between gap-2'>
                    <time className='text-muted-foreground font-mono text-xs'>
                      {new Date(record.createdAt).toLocaleString()}
                    </time>
                    <div className='flex gap-1'>
                      <Button
                        aria-label={t('查看大图')}
                        className='rounded-none'
                        onClick={() =>
                          setPreview({
                            blob: record.images[0],
                            index: 0,
                            recordId: record.id,
                          })
                        }
                        size='icon-sm'
                        type='button'
                        variant='ghost'
                      >
                        <Eye />
                      </Button>
                      <Button
                        aria-label={t('下载图片')}
                        className='rounded-none'
                        onClick={() => download(record.images[0], record.id, 0)}
                        size='icon-sm'
                        type='button'
                        variant='ghost'
                      >
                        <Download />
                      </Button>
                      <Button
                        aria-label={t('删除图片')}
                        className='rounded-none'
                        onClick={() => void removeHistory(record.id)}
                        size='icon-sm'
                        type='button'
                        variant='destructive'
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className='bg-background text-muted-foreground border p-8 text-center text-sm'>
              <ImagePlus className='mx-auto mb-2 size-6' />
              {t('生成的图片会出现在这里')}
            </div>
          )}
        </section>
      </div>

      <div className='bg-background fixed inset-x-0 bottom-0 z-40 border-t p-3 md:hidden'>
        <Sheet>
          <SheetTrigger
            render={<Button className='h-11 w-full rounded-none' />}
          >
            <WandSparkles />
            {t('预览 / 生成')}
          </SheetTrigger>
          <SheetContent
            className='h-dvh w-full rounded-none sm:max-w-none'
            side='bottom'
          >
            <SheetHeader className='border-b'>
              <SheetTitle>{t('提示词预览与生成')}</SheetTitle>
              <SheetDescription>
                {t('检查当前提示词与图片参数')}
              </SheetDescription>
            </SheetHeader>
            <div className='min-h-0 flex-1 overflow-y-auto p-4'>
              <GenerationPanel idPrefix='mobile' {...generationPanelProps} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {preview ? (
        <ImagePreviewDialog
          images={[preview.blob]}
          initialIndex={preview.index}
          onClose={() => setPreview(undefined)}
        />
      ) : null}
    </Main>
  )
}

function GenerationPanel(props: {
  canGenerate: boolean
  error: string
  idPrefix: string
  isGenerating: boolean
  modelAvailable: boolean
  modelsLoaded: boolean
  onGenerate: () => void
  onSettings: React.Dispatch<React.SetStateAction<GenerationSettings>>
  prompt: string
  promptVisible: boolean
  settings: GenerationSettings
}) {
  const { t } = useTranslation()
  const config = getDrawingModelConfig(MODEL)?.textToImage
  return (
    <section
      className='bg-background border'
      aria-label={t('提示词与生成控制')}
    >
      <div className='p-4'>
        <h2 className='text-base font-semibold'>{t('提示词预览')}</h2>
      </div>
      <div className='grid gap-4 p-4'>
        {props.promptVisible ? (
          <Textarea
            className='min-h-64 resize-none rounded-none font-mono text-xs'
            id={`${props.idPrefix}-ecommerce-prompt`}
            readOnly
            value={props.prompt}
          />
        ) : null}
        <div className='grid gap-3 sm:grid-cols-3 md:grid-cols-1'>
          <SelectField
            label='画面比例'
            onChange={(aspectRatio) =>
              props.onSettings((current) => ({ ...current, aspectRatio }))
            }
            options={(config?.aspectRatios ?? ['1:1']).map((value) => ({
              value,
              label: value,
            }))}
            value={props.settings.aspectRatio}
          />
          <SelectField
            label='分辨率'
            onChange={(resolution) =>
              props.onSettings((current) => ({ ...current, resolution }))
            }
            options={(config?.resolutions ?? ['1k']).map((value) => ({
              value,
              label: value,
            }))}
            value={props.settings.resolution}
          />
          <SelectField
            id={`${props.idPrefix}-ecommerce-quality`}
            label='质量'
            onChange={(quality) =>
              props.onSettings((current) => ({ ...current, quality }))
            }
            options={QUALITY_OPTIONS}
            value={props.settings.quality}
          />
        </div>
        {props.settings.quality === 'low' ? (
          <p className='text-warning text-sm' role='status'>
            {t('低质量模式建议仅用作预览')}
          </p>
        ) : null}
        {!props.modelAvailable && props.modelsLoaded ? (
          <p className='text-muted-foreground text-sm' role='status'>
            {t('当前分组无法使用 GPT Image 2')}
          </p>
        ) : null}
        {props.error ? (
          <p className='text-destructive text-sm' role='alert'>
            {props.error}
          </p>
        ) : null}
        <Button
          className='h-11 w-full rounded-none'
          disabled={
            !props.canGenerate || !props.modelAvailable || props.isGenerating
          }
          onClick={props.onGenerate}
          type='button'
        >
          {props.isGenerating ? (
            <Loader2 className='animate-spin' />
          ) : (
            <WandSparkles />
          )}
          {props.isGenerating ? t('生成中') : t('生成图片')}
        </Button>
      </div>
    </section>
  )
}

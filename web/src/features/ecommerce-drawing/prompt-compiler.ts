import type {
  Channel,
  Composition,
  CopyLanguage,
  DetailType,
  DraftErrors,
  EcommerceDraft,
  Focus,
  Option,
  PersonSceneType,
  Pose,
  Presentation,
  Purpose,
  ReferenceRole,
  SceneType,
  SetScope,
  StepNumber,
  VisualStyle,
} from './types'

export const PURPOSE_OPTIONS: Option<Purpose>[] = [
  { value: 'main', label: '一眼看清商品' },
  { value: 'use', label: '理解怎么使用' },
  { value: 'model', label: '看到上身 / 使用效果' },
  { value: 'detail', label: '理解一个具体卖点' },
  { value: 'mood', label: '感受品牌或生活方式' },
  { value: 'custom', label: '其他想法' },
]
export const PRESENTATION_OPTIONS: Option<Presentation>[] = [
  { value: 'alone', label: '单独展示商品' },
  { value: 'scene', label: '放在使用环境中' },
  { value: 'person', label: '由人物展示' },
  { value: 'set', label: '展示商品与包装 / 配件' },
]
export const FOCUS_OPTIONS: Option<Focus>[] = [
  { value: 'overall', label: '整体外观' },
  { value: 'material', label: '颜色和材质' },
  { value: 'size', label: '尺寸 / 数量' },
  { value: 'fit', label: '版型 / 搭配' },
  { value: 'texture', label: '质地 / 使用效果' },
  { value: 'state', label: '打开 / 食用状态' },
  { value: 'structure', label: '接口 / 操作区域' },
  { value: 'set', label: '包装和套装内容' },
  { value: 'selling', label: '一个具体卖点' },
]
export const SCENE_OPTIONS: Option<SceneType>[] = [
  { value: 'simple', label: '简洁背景' },
  { value: 'home', label: '日常生活空间' },
  { value: 'outdoor', label: '自然户外' },
  { value: 'work', label: '专业工作环境' },
  { value: 'festival', label: '节日 / 礼赠场景' },
]
export const PERSON_SCENE_OPTIONS: Option<PersonSceneType>[] =
  SCENE_OPTIONS.filter(
    (option): option is Option<PersonSceneType> => option.value !== 'simple'
  )
export const POSE_OPTIONS: Option<Pose>[] = [
  { value: 'natural', label: '自然展示' },
  { value: 'use', label: '正在使用' },
  { value: 'wear', label: '正在穿戴' },
]
export const SET_SCOPE_OPTIONS: Option<SetScope>[] = [
  { value: 'package', label: '商品和包装' },
  { value: 'full', label: '完整套装' },
  { value: 'named', label: '商品与指定配件' },
]
export const DETAIL_OPTIONS: Option<DetailType>[] = [
  { value: 'function', label: '功能或使用方法' },
  { value: 'structure', label: '尺寸 / 结构' },
  { value: 'material', label: '材质 / 质感' },
  { value: 'set', label: '套装内容' },
  { value: 'steps', label: '使用步骤' },
  { value: 'before_after', label: '使用前后状态' },
]
export const STYLE_OPTIONS: Option<VisualStyle>[] = [
  { value: 'none', label: '不额外指定' },
  { value: 'minimal', label: '极简干净' },
  { value: 'premium', label: '高级质感' },
  { value: 'natural', label: '自然生活' },
  { value: 'vibrant', label: '活力明亮' },
  { value: 'editorial', label: '杂志广告' },
]
export const COMPOSITION_OPTIONS: Option<Composition>[] = [
  { value: 'center', label: '商品居中' },
  { value: 'left', label: '商品靠左，右侧留白' },
  { value: 'right', label: '商品靠右，左侧留白' },
]
export const CHANNEL_OPTIONS: Option<Channel>[] = [
  { value: 'listing', label: '电商主图 / 列表' },
  { value: 'detail', label: '商品详情页' },
  { value: 'social', label: '社媒 / 短视频封面' },
]
export const COPY_LANGUAGE_OPTIONS: Option<CopyLanguage>[] = [
  { value: 'input', label: '以输入框为准' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'ko', label: '韩文' },
  { value: 'ja', label: '日文' },
  { value: 'ru', label: '俄语' },
  { value: 'ar', label: '阿拉伯语' },
  { value: 'custom', label: '自定义语种' },
]

const purposePresentation: Partial<Record<Purpose, Presentation>> = {
  main: 'alone',
  use: 'scene',
  model: 'person',
  detail: 'alone',
  mood: 'scene',
}
const categoryFocusKeywords: Partial<Record<Focus, string[]>> = {
  fit: ['服装', '衣', '裙', '裤', '鞋', '包'],
  texture: ['美妆', '护肤', '口红', '面霜'],
  state: ['食品', '饮料', '茶', '咖啡', '零食'],
  structure: ['数码', '小家电', '耳机', '手机'],
}
const sceneEnglish: Record<SceneType, string> = {
  simple: 'clean, low-distraction background',
  home: 'believable everyday living space',
  outdoor: 'natural outdoor environment',
  work: 'professional work environment',
  festival: 'restrained gift-giving or seasonal setting',
}
const focusEnglish: Record<Focus, string> = {
  overall: 'the complete product appearance',
  material: 'accurate color and material quality',
  size: 'visible scale, size, or item count',
  fit: 'fit, silhouette, and styling',
  texture: 'visible texture or appearance during use',
  state: 'the opened, prepared, or consumption state',
  structure: 'real visible ports, controls, or structure',
  set: 'packaging and complete set contents',
  selling: 'the supplied concrete selling point',
}
const styleEnglish: Record<VisualStyle, string> = {
  none: '',
  minimal: 'minimal, clean commercial photography',
  premium: 'premium commercial photography with refined material rendering',
  natural: 'natural, relaxed lifestyle photography',
  vibrant: 'bright, energetic commercial photography',
  editorial: 'polished editorial advertising photography',
}
const compositionEnglish: Record<Composition, string> = {
  center: 'Center the product with balanced clean space.',
  left: 'Place the product on the left and reserve clean negative space on the right.',
  right:
    'Place the product on the right and reserve clean negative space on the left.',
}
const detailEnglish: Record<DetailType, string> = {
  function: 'function or use method',
  structure: 'size or structure',
  material: 'material or texture',
  set: 'set contents',
  steps: 'use steps',
  before_after: 'visible before-and-after state',
}

export function createDefaultDraft(): EcommerceDraft {
  return {
    purpose: 'main',
    customPurpose: '',
    name: '',
    category: '',
    facts: '',
    productImage: null,
    presentation: 'alone',
    sceneType: 'simple',
    sceneImage: null,
    pose: 'natural',
    personImage: null,
    personScene: false,
    personSceneType: 'home',
    personSceneImage: null,
    setScope: 'package',
    namedAccessory: '',
    focus: 'overall',
    sellingPoint: '',
    detailType: 'function',
    style: 'none',
    styleImage: null,
    composition: 'center',
    channel: 'listing',
    copy: '',
    copyLanguage: 'input',
    customLanguage: '',
    previousCopy: null,
  }
}

export function applyPurposeChange(
  draft: EcommerceDraft,
  purpose: Purpose
): EcommerceDraft {
  const next = { ...draft, purpose }
  const presentation = purposePresentation[purpose]
  if (presentation) next.presentation = presentation
  if (purpose === 'detail') next.focus = 'selling'
  return next
}

export function getVisibleFocuses(category: string): Focus[] {
  return FOCUS_OPTIONS.filter((option) => {
    const keywords = categoryFocusKeywords[option.value]
    return !keywords || keywords.some((keyword) => category.includes(keyword))
  }).map((option) => option.value)
}

export function applyCategoryChange(
  draft: EcommerceDraft,
  category: string
): EcommerceDraft {
  const visible = getVisibleFocuses(category)
  return {
    ...draft,
    category,
    focus: visible.includes(draft.focus) ? draft.focus : 'overall',
  }
}

export function validateStep(
  draft: EcommerceDraft,
  step: StepNumber
): DraftErrors {
  const errors: DraftErrors = {}
  if (step === 1 && draft.purpose === 'custom' && !draft.customPurpose.trim()) {
    errors.customPurpose = '请说明这张图片要表达什么'
  }
  if (step === 2 && !draft.name.trim()) {
    errors.name = '请输入商品名称'
  }
  if (
    step === 3 &&
    draft.presentation === 'set' &&
    draft.setScope === 'named' &&
    !draft.namedAccessory.trim()
  ) {
    errors.namedAccessory = '请写出指定配件'
  }
  if (step === 4 && draft.focus === 'selling' && !draft.sellingPoint.trim()) {
    errors.sellingPoint = '请写出具体卖点'
  }
  if (
    step === 5 &&
    draft.copyLanguage === 'custom' &&
    !draft.customLanguage.trim()
  ) {
    errors.customLanguage = '请输入语种'
  }
  return errors
}

export function getReferenceImages(draft: EcommerceDraft): File[] {
  const roles: ReferenceRole[] = ['productImage']
  if (draft.presentation === 'scene') roles.push('sceneImage')
  if (draft.presentation === 'person') {
    roles.push('personImage')
    if (draft.personScene) roles.push('personSceneImage')
  }
  roles.push('styleImage')
  return roles.flatMap((role) => (draft[role] ? [draft[role]] : []))
}

export function compileEcommercePrompt(draft: EcommerceDraft): string {
  const name = draft.name.trim() || 'the described product'
  const category = draft.category.trim()
  const sections = [
    `Create an ecommerce image for ${name}${category ? `, a ${category}` : ''}.`,
  ]

  sections.push(
    draft.productImage
      ? 'Use the supplied product image as the highest-priority source of truth. Preserve its visible appearance, packaging, text, logo, accessories, and item count exactly.'
      : 'This is a concept product visualization based only on the supplied written description. Do not invent unverified product structure, packaging text, logo, accessories, claims, or certifications.'
  )

  const purposeEnglish: Record<Purpose, string> = {
    main: 'The primary goal is immediate product identification.',
    use: 'The primary goal is to show how the product is used.',
    model: 'The primary goal is to show the product worn or used by a person.',
    detail:
      'The primary goal is to explain one concrete product selling point.',
    mood: 'The primary goal is to communicate a coherent brand or lifestyle mood while keeping the product clear.',
    custom: `The primary goal is to communicate this user-supplied intent: ${draft.customPurpose.trim()}. Keep the product clear.`,
  }
  sections.push(purposeEnglish[draft.purpose])

  if (draft.presentation === 'alone') {
    sections.push(
      'Show the complete product alone on a clean controlled background.'
    )
  }
  if (draft.presentation === 'scene') {
    sections.push(
      `Place the product in a ${sceneEnglish[draft.sceneType]}; keep the product visually dominant.`
    )
    if (draft.sceneImage) {
      sections.push(
        'Use the supplied scene image only for setting and mood, never for composition.'
      )
    }
  }
  if (draft.presentation === 'person') {
    const pose = {
      natural: 'natural display',
      use: 'use action',
      wear: 'wearing',
    }[draft.pose]
    sections.push(
      `Show the product with a person in a ${pose} pose; keep the product unobscured and visually dominant.`
    )
    sections.push(
      draft.personScene
        ? `Use a restrained ${sceneEnglish[draft.personSceneType]} environment.`
        : 'Use a simple, low-distraction background.'
    )
    if (draft.personImage) {
      sections.push(
        'Use the supplied person image only for appearance and pose.'
      )
    }
    if (draft.personScene && draft.personSceneImage) {
      sections.push(
        'Use the supplied scene image only for setting and mood, never for composition.'
      )
    }
  }
  if (draft.presentation === 'set') {
    if (draft.setScope === 'package') {
      sections.push(
        'Show the product together with its supplied packaging only.'
      )
    } else if (draft.setScope === 'full') {
      sections.push('Show the complete supplied set contents together.')
    } else {
      sections.push(
        `Show the product only with these specified supplied accessories: ${draft.namedAccessory.trim()}. Do not invent included items.`
      )
    }
  }

  const sellingPoint = draft.sellingPoint.trim()
  sections.push(
    `Emphasize ${focusEnglish[draft.focus]}${
      draft.focus === 'selling' && sellingPoint ? `: ${sellingPoint}` : ''
    }.`
  )
  if (draft.purpose === 'detail') {
    sections.push(`Explain ${detailEnglish[draft.detailType]}.`)
  }
  if (draft.facts.trim()) {
    sections.push(
      `Preserve these supplied facts exactly: ${draft.facts.trim()}.`
    )
  }
  if (draft.style !== 'none') {
    sections.push(`Visual style: ${styleEnglish[draft.style]}.`)
  }
  if (draft.styleImage) {
    sections.push(
      'Use the supplied style image only for lighting, image quality, and overall visual expression; it must not alter product facts or override composition.'
    )
  }
  sections.push(compositionEnglish[draft.composition])
  if (draft.copy.trim()) {
    sections.push(
      `Render this exact short text: "${draft.copy.trim()}". Do not translate, add, or alter it.`
    )
  }
  sections.push(
    'Preserve product color, shape, material, packaging, visible text, logo, proportions, and item count. Use physically coherent light, shadows, reflections, contact, and scale. Do not add unsupported claims, certifications, logos, watermarks, or accessories. Keep background and props subordinate to the product.'
  )
  const channelEnglish: Record<Channel, string> = {
    listing:
      'Compose for an ecommerce listing image: product large and immediately recognizable, with minimal distraction.',
    detail:
      'Compose for a product detail page with a clear information hierarchy and safe negative space.',
    social:
      'Compose for a social or short-video cover with a clear subject hierarchy and safe negative space.',
  }
  sections.push(channelEnglish[draft.channel])
  return sections.join('\n\n')
}

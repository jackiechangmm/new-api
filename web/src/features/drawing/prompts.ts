export interface DrawingPrompt {
  id: string
  titleKey: string
  prompt: string
  descriptionKey: string
  tags: string[]
  coverUrl?: string
  sourceUrl?: string
}

export const DRAWING_PROMPTS: DrawingPrompt[] = [
  {
    id: 'editorial-portrait',
    titleKey: 'Editorial portrait',
    prompt: 'A refined editorial portrait, natural window light, expressive eyes, subtle film grain, understated styling, clean background, 85mm lens',
    descriptionKey: 'A polished portrait with soft natural light and a magazine finish.',
    tags: ['portrait', 'editorial'],
  },
  {
    id: 'architectural-study',
    titleKey: 'Architectural study',
    prompt: 'A contemporary concrete pavilion in a quiet landscape, precise geometric composition, long afternoon shadows, architectural photography, muted colors',
    descriptionKey: 'Minimal architecture photographed with precise geometry.',
    tags: ['architecture', 'minimal'],
  },
  {
    id: 'product-still-life',
    titleKey: 'Product still life',
    prompt: 'A premium product still life on a sculptural pedestal, controlled studio lighting, crisp material detail, generous negative space, commercial campaign photography',
    descriptionKey: 'A clean commercial setup for product concepts and campaigns.',
    tags: ['product', 'studio'],
  },
  {
    id: 'cinematic-landscape',
    titleKey: 'Cinematic landscape',
    prompt: 'A cinematic mountain valley after rain, low clouds between the peaks, warm light breaking through, realistic atmospheric depth, detailed landscape photography',
    descriptionKey: 'Atmospheric scenery with realistic depth and natural light.',
    tags: ['landscape', 'cinematic'],
  },
  {
    id: 'ink-botanical',
    titleKey: 'Ink botanical',
    prompt: 'A detailed botanical illustration of wild flowers and leaves, expressive black ink lines, restrained paper texture, elegant scientific illustration composition',
    descriptionKey: 'An expressive black-ink botanical illustration.',
    tags: ['illustration', 'botanical'],
  },
  {
    id: 'futuristic-interior',
    titleKey: 'Futuristic interior',
    prompt: 'A calm futuristic reading room with curved timber, brushed metal details and soft indirect lighting, realistic interior photography, warm neutral palette',
    descriptionKey: 'A warm, believable interior concept with restrained futurism.',
    tags: ['interior', 'concept'],
  },
]

export function filterDrawingPrompts(query: string, tag: string): DrawingPrompt[] {
  const normalized = query.trim().toLowerCase()
  return DRAWING_PROMPTS.filter((item) => {
    const searchable = [
      item.titleKey,
      item.prompt,
      item.descriptionKey,
      ...item.tags,
      item.coverUrl ?? '',
      item.sourceUrl ?? '',
    ].join(' ').toLowerCase()
    return (
      !searchable.includes('nsfw') &&
      (!tag || item.tags.includes(tag)) &&
      (!normalized || searchable.includes(normalized))
    )
  })
}

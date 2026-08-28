import {
  DRAWING_PROMPTS as collectedPrompts,
  DRAWING_PROMPT_CATEGORIES as collectedCategories,
  DRAWING_PROMPT_SCENES as collectedScenes,
  DRAWING_PROMPT_SOURCE,
  DRAWING_PROMPT_STYLES as collectedStyles,
} from './prompts-data'

export interface DrawingPrompt {
  id: string
  title: string
  prompt: string
  description: string
  category: string
  styles: string[]
  scenes: string[]
  sourceLabel: string
  sourceUrl?: string
  githubUrl: string
  coverUrl?: string
}

export interface DrawingPromptFilters {
  category?: string
  style?: string
  scene?: string
}

export { DRAWING_PROMPT_SOURCE }
export const DRAWING_PROMPT_CATEGORIES: string[] = [...collectedCategories]
export const DRAWING_PROMPT_STYLES: string[] = [...collectedStyles]
export const DRAWING_PROMPT_SCENES: string[] = [...collectedScenes]
export const DRAWING_PROMPTS: DrawingPrompt[] = collectedPrompts.map(
  (item) => ({
    ...item,
    styles: [...item.styles],
    scenes: [...item.scenes],
    coverUrl: item.coverUrl || undefined,
    sourceUrl: item.sourceUrl || undefined,
  })
)

export function filterDrawingPrompts(
  query: string,
  filters: DrawingPromptFilters = {}
): DrawingPrompt[] {
  const normalized = query.trim().toLowerCase()
  return DRAWING_PROMPTS.filter((item) => {
    const searchable = [
      item.title,
      item.prompt,
      item.description,
      item.category,
      ...item.styles,
      ...item.scenes,
      item.sourceLabel,
      item.sourceUrl ?? '',
      item.githubUrl,
    ]
      .join(' ')
      .toLowerCase()
    return (
      (!filters.category || item.category === filters.category) &&
      (!filters.style || item.styles.includes(filters.style)) &&
      (!filters.scene || item.scenes.includes(filters.scene)) &&
      (!normalized || searchable.includes(normalized))
    )
  })
}

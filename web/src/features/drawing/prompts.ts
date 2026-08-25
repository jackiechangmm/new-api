import { DRAWING_PROMPTS as collectedPrompts } from './prompts-data'

export interface DrawingPrompt {
  id: string
  title: string
  prompt: string
  description: string
  tags: string[]
  coverUrl?: string
  sourceUrl?: string
}

export const DRAWING_PROMPTS: DrawingPrompt[] = collectedPrompts.map((item) => ({
  ...item,
  tags: [...item.tags],
  coverUrl: item.coverUrl || undefined,
  sourceUrl: item.sourceUrl || undefined,
}))

export function filterDrawingPrompts(query: string, tag: string): DrawingPrompt[] {
  const normalized = query.trim().toLowerCase()
  return DRAWING_PROMPTS.filter((item) => {
    const searchable = [
      item.title,
      item.prompt,
      item.description,
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

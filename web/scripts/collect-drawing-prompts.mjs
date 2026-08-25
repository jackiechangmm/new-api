import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sources = [
  'banana-prompt-quicker',
  'davidwu-gpt-image2-prompts',
  'freestylefly-gpt-image-2',
  'awesome-gpt-image',
  'awesome-gpt4o-image-prompts',
  'youmind-gpt-image-2',
  'youmind-nano-banana-pro',
]
const baseUrl = 'https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources'
const outputPath = path.resolve('src/features/drawing/prompts-data.ts')

function containsNsfw(record) {
  return ['title', 'prompt', 'description', 'tags', 'preview', 'sourceUrl', 'coverUrl']
    .map((field) => record[field])
    .flat(Infinity)
    .some((value) => typeof value === 'string' && value.toLowerCase().includes('nsfw'))
}

function cleanTags(tags, sourceId) {
  if (!Array.isArray(tags)) return []
  if (sourceId === 'banana-prompt-quicker') return tags.slice(0, 2)
  if (sourceId === 'davidwu-gpt-image2-prompts') {
    return tags.filter((tag, index) => {
      if (tag === '需要参考图') return true
      if (index < 2) return true
      return false
    })
  }
  if (sourceId === 'freestylefly-gpt-image-2') {
    return tags.filter((tag) => tag !== 'featured')
  }
  if (sourceId === 'awesome-gpt-image') return tags.slice(0, 1)
  if (sourceId === 'awesome-gpt4o-image-prompts') return tags.slice(0, 1)
  if (sourceId === 'youmind-gpt-image-2') return tags.slice(0, 2)
  if (sourceId === 'youmind-nano-banana-pro') return tags.slice(0, 2)
  return tags
}

function normalize(record, sourceId, index) {
  return {
    id: String(record.id || `${sourceId}:${index + 1}`),
    title: typeof record.title === 'string' ? record.title : '',
    prompt: typeof record.prompt === 'string' ? record.prompt : '',
    description: typeof record.description === 'string' ? record.description : '',
    tags: cleanTags(record.tags, sourceId),
    coverUrl: typeof record.coverUrl === 'string' ? record.coverUrl : '',
    sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : '',
  }
}

const allItems = []
const report = []
for (const sourceId of sources) {
  const response = await fetch(`${baseUrl}/${sourceId}.json`)
  if (!response.ok) throw new Error(`${sourceId}: HTTP ${response.status}`)
  const records = await response.json()
  const sourceItems = records
    .filter((record) => record && typeof record === 'object' && !containsNsfw(record))
    .map((record, index) => normalize(record, sourceId, index))
    .filter((record) => record.title && record.prompt)
  const originalTagCount = records.reduce((sum, record) => sum + (Array.isArray(record?.tags) ? record.tags.length : 0), 0)
  const cleanedTagCount = sourceItems.reduce((sum, record) => sum + record.tags.length, 0)
  allItems.push(...sourceItems)
  report.push({
    sourceId,
    total: records.length,
    kept: sourceItems.length,
    removed: records.length - sourceItems.length,
    tagsBefore: originalTagCount,
    tagsAfter: cleanedTagCount,
    tagsRemoved: originalTagCount - cleanedTagCount,
  })
}

const content = `// 由 scripts/collect-drawing-prompts.mjs 生成，请勿手动编辑。\nexport const DRAWING_PROMPTS = ${JSON.stringify(allItems, null, 2)} as const\n`
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, content)
console.log(JSON.stringify({ total: allItems.length, removed: report.reduce((sum, item) => sum + item.removed, 0), sources: report }, null, 2))

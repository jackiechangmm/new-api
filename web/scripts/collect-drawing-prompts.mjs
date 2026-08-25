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

function normalize(record, sourceId, index) {
  return {
    id: String(record.id || `${sourceId}:${index + 1}`),
    title: typeof record.title === 'string' ? record.title : '',
    prompt: typeof record.prompt === 'string' ? record.prompt : '',
    description: typeof record.description === 'string' ? record.description : '',
    tags: Array.isArray(record.tags) ? record.tags : [],
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
  const items = records
    .filter((record) => record && typeof record === 'object' && !containsNsfw(record))
    .map((record, index) => normalize(record, sourceId, index))
    .filter((record) => record.title && record.prompt)
  allItems.push(...items)
  report.push({ sourceId, total: records.length, kept: items.length, removed: records.length - items.length })
}

const content = `// 由 scripts/collect-drawing-prompts.mjs 生成，请勿手动编辑。\nexport const DRAWING_PROMPTS = ${JSON.stringify(allItems, null, 2)} as const\n`
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, content)
console.log(JSON.stringify({ total: allItems.length, removed: report.reduce((sum, item) => sum + item.removed, 0), sources: report }, null, 2))

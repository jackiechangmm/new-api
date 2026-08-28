import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceUrl =
  'https://api.github.com/repos/freestylefly/awesome-gpt-image-2/contents/data/cases.json'
const expectedRepository = 'https://github.com/freestylefly/awesome-gpt-image-2'
const coverPrefix = `https://gh-proxy.org/${expectedRepository}/blob/main/data/images/`
const outputPath = path.resolve('src/features/drawing/prompts-data.ts')

function requireString(value, field, id) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`案例 ${id} 缺少 ${field}`)
  }
  return value
}

function requireStrings(value, field, id) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`案例 ${id} 的 ${field} 无效`)
  }
  return value
}

function normalizeCase(record) {
  if (!record || typeof record !== 'object') throw new Error('案例记录无效')
  const id = String(record.id ?? '')
  if (!id) throw new Error('案例缺少 id')
  const image = typeof record.image === 'string' ? record.image : ''
  return {
    id,
    title: requireString(record.title, 'title', id),
    prompt: requireString(record.prompt, 'prompt', id),
    description:
      typeof record.promptPreview === 'string' ? record.promptPreview : '',
    category: requireString(record.category, 'category', id),
    styles: requireStrings(record.styles, 'styles', id),
    scenes: requireStrings(record.scenes, 'scenes', id),
    sourceLabel:
      typeof record.sourceLabel === 'string' ? record.sourceLabel : '',
    sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : '',
    githubUrl: requireString(record.githubUrl, 'githubUrl', id),
    coverUrl: image ? `${coverPrefix}${path.posix.basename(image)}` : '',
  }
}

async function main() {
  const response = await fetch(sourceUrl, {
    headers: {
      accept: 'application/vnd.github.raw+json',
      'user-agent': 'new-api drawing prompt collector',
    },
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    throw new Error(`提示词数据请求失败：HTTP ${response.status}`)
  }

  const data = await response.json()
  if (
    !data ||
    data.repository !== expectedRepository ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.styles) ||
    !Array.isArray(data.scenes) ||
    !Array.isArray(data.cases)
  ) {
    throw new Error('提示词数据格式无效')
  }

  const prompts = data.cases.map(normalizeCase)
  const content = `// 由 scripts/collect-drawing-prompts.mjs 生成，请勿手动编辑。\nexport const DRAWING_PROMPT_SOURCE = ${JSON.stringify(data.repository)} as const\nexport const DRAWING_PROMPT_CATEGORIES = ${JSON.stringify(data.categories, null, 2)} as const\nexport const DRAWING_PROMPT_STYLES = ${JSON.stringify(data.styles, null, 2)} as const\nexport const DRAWING_PROMPT_SCENES = ${JSON.stringify(data.scenes, null, 2)} as const\nexport const DRAWING_PROMPTS = ${JSON.stringify(prompts, null, 2)} as const\n`

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, content)
  const format = spawnSync(
    'oxfmt',
    ['-c', '.oxfmtrc.json', '--write', outputPath],
    { stdio: 'inherit' }
  )
  if (format.status !== 0) throw new Error('提示词数据格式化失败')
  console.log(`已采集 ${prompts.length} 条图片提示词案例`)
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) await main()

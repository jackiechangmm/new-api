import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const sources = [
  'banana-prompt-quicker',
  'davidwu-gpt-image2-prompts',
  'freestylefly-gpt-image-2',
  'awesome-gpt-image',
  'awesome-gpt4o-image-prompts',
  'youmind-gpt-image-2',
  'youmind-nano-banana-pro',
]
const baseUrl =
  'https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources'
const outputPath = path.resolve('src/features/drawing/prompts-data.ts')
const coverOutputDir = path.resolve(
  process.env.DRAWING_COVERS_DIR || '../.cache/drawing-covers'
)
const reportPath = path.resolve('../.cache/drawing-covers-report.json')
const coverBasePath = '/drawing-covers'
const maxCoverBytes = 10 * 1024 * 1024
const maxCoverDimension = 4096
const webpQuality = 80
const downloadConcurrency = 8
const acceptedTypes = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

function containsNsfw(record) {
  return [
    'title',
    'prompt',
    'description',
    'tags',
    'preview',
    'sourceUrl',
    'coverUrl',
  ]
    .map((field) => record[field])
    .flat(Infinity)
    .some(
      (value) =>
        typeof value === 'string' && value.toLowerCase().includes('nsfw')
    )
}

function cleanTags(tags, sourceId) {
  if (!Array.isArray(tags)) return []
  const withoutAttribution = tags.filter(
    (tag) => typeof tag === 'string' && !tag.includes('@')
  )
  if (sourceId === 'banana-prompt-quicker') {
    return withoutAttribution.slice(0, 2)
  }
  if (sourceId === 'davidwu-gpt-image2-prompts') {
    return withoutAttribution.filter((tag, index) => {
      if (tag === '需要参考图') return true
      if (index < 2) return true
      return false
    })
  }
  if (sourceId === 'freestylefly-gpt-image-2') {
    return withoutAttribution.filter((tag) => tag !== 'featured')
  }
  if (sourceId === 'awesome-gpt-image') return withoutAttribution.slice(0, 1)
  if (sourceId === 'awesome-gpt4o-image-prompts') {
    return withoutAttribution.slice(0, 1)
  }
  if (sourceId === 'youmind-gpt-image-2') {
    return withoutAttribution.slice(0, 2)
  }
  if (sourceId === 'youmind-nano-banana-pro') {
    return withoutAttribution.slice(0, 2)
  }
  return withoutAttribution
}

function normalize(record, sourceId, index) {
  return {
    id: String(record.id || `${sourceId}:${index + 1}`),
    title: typeof record.title === 'string' ? record.title : '',
    prompt: typeof record.prompt === 'string' ? record.prompt : '',
    description:
      typeof record.description === 'string' ? record.description : '',
    tags: cleanTags(record.tags, sourceId),
    coverUrl: typeof record.coverUrl === 'string' ? record.coverUrl : '',
    sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : '',
  }
}

export async function convertCover(buffer, contentType) {
  const expectedFormat = acceptedTypes.get(contentType.split(';', 1)[0].trim())
  if (!expectedFormat) {
    throw new Error(`不支持的响应类型：${contentType || '缺失'}`)
  }

  const image = sharp(buffer, {
    failOn: 'error',
    limitInputPixels: maxCoverDimension * maxCoverDimension,
  })
  const metadata = await image.metadata()
  if (metadata.format !== expectedFormat) {
    throw new Error(`响应类型与文件内容不符：${contentType}`)
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > maxCoverDimension ||
    metadata.height > maxCoverDimension
  ) {
    throw new Error(
      `封面尺寸无效：${metadata.width || 0}x${metadata.height || 0}`
    )
  }
  return image.rotate().webp({ quality: webpQuality }).toBuffer()
}

async function readBody(response) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxCoverBytes) {
    throw new Error(`封面超过 ${maxCoverBytes} 字节`)
  }

  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    total += chunk.byteLength
    if (total > maxCoverBytes) {
      throw new Error(`封面超过 ${maxCoverBytes} 字节`)
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function downloadCover(url) {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'https:') throw new Error('封面必须使用 HTTPS')

  const response = await fetch(parsedUrl, {
    headers: { 'user-agent': 'Bululu drawing cover collector' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (new URL(response.url).protocol !== 'https:') {
    throw new Error('封面重定向到了非 HTTPS 地址')
  }

  const sourceBuffer = await readBody(response)
  const buffer = await convertCover(
    sourceBuffer,
    response.headers.get('content-type') || ''
  )
  const hash = createHash('sha256').update(buffer).digest('hex')
  const filename = `${hash}.webp`
  await writeFile(path.join(coverOutputDir, filename), buffer, {
    flag: 'wx',
  }).catch((error) => {
    if (error.code !== 'EEXIST') throw error
  })
  return {
    bytes: buffer.byteLength,
    sourceBytes: sourceBuffer.byteLength,
    localUrl: `${coverBasePath}/${filename}`,
  }
}

async function collectCovers(items) {
  const urls = [...new Set(items.map((item) => item.coverUrl).filter(Boolean))]
  const results = new Map()
  const failures = []
  let cursor = 0
  let completed = 0

  await Promise.all(
    Array.from({ length: downloadConcurrency }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor]
        cursor += 1
        try {
          results.set(url, await downloadCover(url))
        } catch (error) {
          failures.push({
            url,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        completed += 1
        if (completed % 50 === 0 || completed === urls.length) {
          console.log(`封面下载：${completed}/${urls.length}`)
        }
      }
    })
  )

  const uniqueResults = new Map(
    [...results.values()].map((result) => [result.localUrl, result])
  )
  return {
    failures,
    items: items.map((item) => ({
      ...item,
      coverUrl: results.get(item.coverUrl)?.localUrl || '',
    })),
    successfulUrls: results.size,
    sourceBytes: [...uniqueResults.values()].reduce(
      (sum, result) => sum + result.sourceBytes,
      0
    ),
    totalBytes: [...uniqueResults.values()].reduce(
      (sum, result) => sum + result.bytes,
      0
    ),
    uniqueCovers: uniqueResults.size,
  }
}

async function main() {
  await rm(coverOutputDir, { force: true, recursive: true })
  await mkdir(coverOutputDir, { recursive: true })

  const allItems = []
  const sourcesReport = []
  for (const sourceId of sources) {
    const response = await fetch(`${baseUrl}/${sourceId}.json`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`${sourceId}: HTTP ${response.status}`)
    const records = await response.json()
    const sourceItems = records
      .filter(
        (record) =>
          record && typeof record === 'object' && !containsNsfw(record)
      )
      .map((record, index) => normalize(record, sourceId, index))
      .filter((record) => record.title && record.prompt)
    const originalTagCount = records.reduce(
      (sum, record) =>
        sum + (Array.isArray(record?.tags) ? record.tags.length : 0),
      0
    )
    const cleanedTagCount = sourceItems.reduce(
      (sum, record) => sum + record.tags.length,
      0
    )
    allItems.push(...sourceItems)
    sourcesReport.push({
      sourceId,
      total: records.length,
      kept: sourceItems.length,
      removed: records.length - sourceItems.length,
      tagsBefore: originalTagCount,
      tagsAfter: cleanedTagCount,
      tagsRemoved: originalTagCount - cleanedTagCount,
    })
  }

  const covers = await collectCovers(allItems)
  const content = `// 由 scripts/collect-drawing-prompts.mjs 生成，请勿手动编辑。\nexport const DRAWING_PROMPTS = ${JSON.stringify(covers.items, null, 2)} as const\n`
  const report = {
    total: covers.items.length,
    removed: sourcesReport.reduce((sum, item) => sum + item.removed, 0),
    covers: {
      successfulUrls: covers.successfulUrls,
      files: covers.uniqueCovers,
      failed: covers.failures.length,
      format: 'webp',
      quality: webpQuality,
      sourceBytes: covers.sourceBytes,
      bytes: covers.totalBytes,
      savedPercent: Math.round(
        (1 - covers.totalBytes / covers.sourceBytes) * 100
      ),
      outputDirectory: coverOutputDir,
      failures: covers.failures,
    },
    sources: sourcesReport,
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(outputPath, content)
  const format = spawnSync(
    'oxfmt',
    ['-c', '.oxfmtrc.json', '--write', outputPath],
    { stdio: 'inherit' }
  )
  if (format.status !== 0) throw new Error('提示词数据格式化失败')
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) await main()

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DRAWING_PROMPTS,
  DRAWING_PROMPT_CATEGORIES,
  DRAWING_PROMPT_SCENES,
  DRAWING_PROMPT_SOURCE,
  DRAWING_PROMPT_STYLES,
  filterDrawingPrompts,
} from '../prompts'

const upstream = 'https://github.com/freestylefly/awesome-gpt-image-2'
const coverPrefix = `https://gh-proxy.org/${upstream}/blob/main/data/images/`

test('loads valid prompt cases from the configured upstream source', () => {
  assert.equal(DRAWING_PROMPT_SOURCE, upstream)
  assert.ok(DRAWING_PROMPTS.length > 0)
  assert.ok(
    DRAWING_PROMPTS.every(
      (item) =>
        item.id &&
        item.title &&
        item.prompt &&
        item.githubUrl.startsWith(upstream) &&
        item.category &&
        Array.isArray(item.styles) &&
        Array.isArray(item.scenes)
    )
  )
})

test('keeps category, style, and scene as independent filter dimensions', () => {
  const item = DRAWING_PROMPTS.find(
    (candidate) => candidate.styles.length > 0 && candidate.scenes.length > 0
  )
  assert.ok(item)
  assert.ok(DRAWING_PROMPT_CATEGORIES.includes(item.category))
  assert.ok(DRAWING_PROMPT_STYLES.includes(item.styles[0]))
  assert.ok(DRAWING_PROMPT_SCENES.includes(item.scenes[0]))
  assert.ok(
    filterDrawingPrompts('', {
      category: item.category,
      style: item.styles[0],
      scene: item.scenes[0],
    }).every(
      (candidate) =>
        candidate.category === item.category &&
        candidate.styles.includes(item.styles[0]) &&
        candidate.scenes.includes(item.scenes[0])
    )
  )
})

test('searches titles, prompts, sources, and all classification dimensions', () => {
  const item = DRAWING_PROMPTS.find(
    (candidate) => candidate.styles.length > 0 && candidate.scenes.length > 0
  )
  assert.ok(item)
  for (const query of [
    item.title,
    item.prompt,
    item.sourceUrl || item.githubUrl,
    item.category,
    item.styles[0],
    item.scenes[0],
  ]) {
    assert.ok(filterDrawingPrompts(query).includes(item))
  }
})

test('uses proxied upstream covers instead of local cover snapshots', () => {
  assert.ok(
    DRAWING_PROMPTS.every(
      (item) => !item.coverUrl || item.coverUrl.startsWith(coverPrefix)
    )
  )
})

test('does not silently exclude prompt cases containing nsfw text', () => {
  const item = DRAWING_PROMPTS[0]
  assert.ok(item)
  const title = item.title
  item.title = `${title} nsfw`
  assert.ok(filterDrawingPrompts('nsfw').includes(item))
  item.title = title
})

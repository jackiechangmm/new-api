import assert from 'node:assert/strict'
import test from 'node:test'

import { DRAWING_PROMPTS, filterDrawingPrompts } from '../prompts'

test('loads the collected prompt set instead of a six-item placeholder set', () => {
  assert.ok(DRAWING_PROMPTS.length > 6)
})

test('keeps model and content tags while removing source attribution tags', () => {
  assert.ok(DRAWING_PROMPTS.every((item) => item.tags.every((tag) => !tag.includes('@'))))

  const technical = DRAWING_PROMPTS.find((item) => item.title.includes('技术剖面图'))
  assert.deepEqual(technical?.tags, ['nano-banana-pro', '信息图 / 教育视觉图'])

  const freestyle = DRAWING_PROMPTS.find((item) => item.id.startsWith('freestylefly-gpt-image-2:'))
  assert.ok(freestyle)
  assert.ok(freestyle.tags.includes('gpt-image-2'))
  assert.ok(!freestyle.tags.includes('featured'))

  const davidWu = DRAWING_PROMPTS.find((item) => item.id.startsWith('davidwu-gpt-image2-prompts:'))
  assert.ok(davidWu)
  assert.ok(davidWu.tags.every((tag) => tag !== 'freestylefly' && !tag.startsWith('@')))
})

test('filters drawing prompts by tag and case-insensitive search', () => {
  const first = DRAWING_PROMPTS[0]
  assert.ok(first)
  assert.deepEqual(filterDrawingPrompts(first.title.toUpperCase(), first.tags[0]), [first])
})

test('excludes drawing prompts containing nsfw markers', () => {
  const original = DRAWING_PROMPTS.length
  DRAWING_PROMPTS.push({ id: 'unsafe', title: 'nsfw sample', prompt: 'safe', description: 'safe', tags: [] })
  assert.equal(filterDrawingPrompts('', '').length, original)
  DRAWING_PROMPTS.pop()
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { DRAWING_PROMPTS, filterDrawingPrompts } from '../prompts'

test('loads the collected prompt set instead of a six-item placeholder set', () => {
  assert.ok(DRAWING_PROMPTS.length > 6)
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

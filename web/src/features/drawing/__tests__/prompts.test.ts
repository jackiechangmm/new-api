import assert from 'node:assert/strict'
import test from 'node:test'

import { DRAWING_PROMPTS, filterDrawingPrompts } from '../prompts'

test('filters drawing prompts by tag and case-insensitive search', () => {
  assert.equal(filterDrawingPrompts('PORTRAIT', 'portrait').length, 1)
})

test('excludes drawing prompts containing nsfw markers', () => {
  const original = DRAWING_PROMPTS.length
  DRAWING_PROMPTS.push({ id: 'unsafe', titleKey: 'nsfw sample', prompt: 'safe', descriptionKey: 'safe', tags: [] })
  assert.equal(filterDrawingPrompts('', '').length, original)
  DRAWING_PROMPTS.pop()
})

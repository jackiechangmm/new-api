import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DRAWING_MODEL_CONFIGS,
  filterDrawingModels,
  getDrawingModelConfig,
  getFixedOrSelectedValue,
} from '../model-config'

test('filters available models through the drawing whitelist', () => {
  assert.deepEqual(
    filterDrawingModels([
      'text-only',
      'gpt-image-2-official',
      'unconfigured-image-model',
    ]),
    ['gpt-image-2-official']
  )
})

test('keeps text-to-image and image-to-image configuration independent', () => {
  const config = getDrawingModelConfig('gpt-image-2-official')

  assert.equal(config, DRAWING_MODEL_CONFIGS[0])
  assert.equal(config?.textToImage?.input, undefined)
  assert.deepEqual(config?.imageToImage?.input?.formats, [
    'image/jpeg',
    'image/png',
    'image/webp',
  ])
})

test('uses a single option as a fixed value and rejects unsupported values', () => {
  assert.equal(getFixedOrSelectedValue(['1:1'], '16:9'), '1:1')
  assert.equal(getFixedOrSelectedValue(undefined, '1:1'), undefined)
  assert.equal(getFixedOrSelectedValue(['1:1', '16:9'], '16:9'), '16:9')
})

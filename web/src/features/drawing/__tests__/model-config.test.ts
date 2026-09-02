import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterDrawingModels,
  getDrawingModelConfig,
  getFixedOrSelectedValue,
} from '../model-config'

test('filters available models through the drawing whitelist', () => {
  assert.deepEqual(
    filterDrawingModels([
      'text-only',
      'mj_imagine',
      'gpt-image-2',
      'grok-imagine-image-2.0',
      'nano-banana-2',
      'nano-banana-2-lite',
      'unconfigured-image-model',
    ]),
    [
      'gpt-image-2',
      'nano-banana-2',
      'nano-banana-2-lite',
      'grok-imagine-image-2.0',
      'mj_imagine',
    ]
  )
})

test('configures Midjourney Imagine as an asynchronous single-image model', () => {
  const config = getDrawingModelConfig('mj_imagine')

  assert.equal(config?.requestFormat, 'midjourney')
  assert.equal(config?.textToImage?.maxOutputs, 1)
  assert.equal(config?.imageToImage?.maxOutputs, 1)
  assert.deepEqual(config?.imageToImage?.input?.formats, [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ])
  assert.equal(config?.imageToImage?.input?.maxImages, 16)
})

test('configures Grok Imagine 2 for generation and up to three reference images', () => {
  const config = getDrawingModelConfig('grok-imagine-image-2.0')

  assert.equal(config?.requestFormat, 'openai-image')
  assert.deepEqual(config?.textToImage?.resolutions, ['1k', '2k'])
  assert.deepEqual(config?.textToImage?.qualities, ['low', 'medium'])
  assert.equal(config?.textToImage?.maxOutputs, 10)
  assert.equal(config?.imageToImage?.input?.maxImages, 3)
  assert.equal(config?.imageToImage?.maxOutputs, 10)
})
test('keeps text-to-image and image-to-image configuration independent', () => {
  const config = getDrawingModelConfig('gpt-image-2')

  assert.equal(config, getDrawingModelConfig('gpt-image-2'))
  assert.equal(config?.textToImage?.input, undefined)
  assert.deepEqual(config?.imageToImage?.input?.formats, [
    'image/jpeg',
    'image/png',
    'image/webp',
  ])
})

test('configures Nano Banana 2 for 512 to 4K image generation and edits', () => {
  const config = getDrawingModelConfig('nano-banana-2')

  assert.equal(config?.requestFormat, 'gemini-generate-content')
  assert.deepEqual(config?.textToImage?.resolutions, ['512', '1k', '2k', '4k'])
  assert.equal(config?.textToImage?.maxOutputs, 1)
  assert.deepEqual(config?.imageToImage?.input?.formats, [
    'image/jpeg',
    'image/png',
  ])
  assert.equal(config?.imageToImage?.input?.maxImages, 14)
  assert.equal(config?.imageToImage?.input?.maxImageBytes, 7 * 1024 * 1024)
})

test('configures Nano Banana Lite for one 1K output and JPEG/PNG edits', () => {
  const config = getDrawingModelConfig('nano-banana-2-lite')

  assert.equal(config?.requestFormat, 'gemini-generate-content')
  assert.deepEqual(config?.textToImage?.resolutions, ['1k'])
  assert.equal(config?.textToImage?.qualities, undefined)
  assert.equal(config?.textToImage?.maxOutputs, 1)
  assert.deepEqual(config?.imageToImage?.input?.formats, [
    'image/jpeg',
    'image/png',
  ])
  assert.equal(config?.imageToImage?.input?.maxImages, undefined)
})

test('uses a single option as a fixed value and rejects unsupported values', () => {
  assert.equal(getFixedOrSelectedValue(['1:1'], '16:9'), '1:1')
  assert.equal(getFixedOrSelectedValue(undefined, '1:1'), undefined)
  assert.equal(getFixedOrSelectedValue(['1:1', '16:9'], '16:9'), '16:9')
})

import assert from 'node:assert/strict'
import test from 'node:test'

import sharp from 'sharp'

import { convertCover } from '../collect-drawing-prompts.mjs'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

test('converts a valid supported cover to WebP', async () => {
  const converted = await convertCover(onePixelPng, 'image/png')

  assert.equal(converted.subarray(0, 4).toString(), 'RIFF')
  assert.equal(converted.subarray(8, 12).toString(), 'WEBP')
})

test('rejects a response type that disagrees with the cover bytes', async () => {
  await assert.rejects(
    convertCover(onePixelPng, 'image/jpeg'),
    /响应类型与文件内容不符/
  )
})

test('rejects a cover whose longest edge exceeds 4096 pixels', async () => {
  const oversizedPng = await sharp({
    create: {
      width: 4097,
      height: 1,
      channels: 3,
      background: 'white',
    },
  })
    .png()
    .toBuffer()

  await assert.rejects(
    convertCover(oversizedPng, 'image/png'),
    /封面尺寸无效：4097x1/
  )
})

import { test } from 'bun:test'
import assert from 'node:assert/strict'

import { restoreReferenceImage, validateReferenceImages } from '../validation'

test('restores historical JPEG and WebP blobs with matching file metadata', () => {
  const jpeg = restoreReferenceImage(
    new Blob(['jpeg'], { type: 'image/jpeg' }),
    0
  )
  const webp = restoreReferenceImage(
    new Blob(['webp'], { type: 'image/webp' }),
    1
  )

  assert.equal(jpeg.name, 'reference-0.jpg')
  assert.equal(jpeg.type, 'image/jpeg')
  assert.equal(webp.name, 'reference-1.webp')
  assert.equal(webp.type, 'image/webp')
})

test('revalidates every restored image against the selected model input', async () => {
  const files = [
    new File(['reference'], 'reference.webp', { type: 'image/webp' }),
  ]

  const error = await validateReferenceImages(files, {
    formats: ['image/jpeg', 'image/png'],
  })

  assert.equal(error, 'unsupported')
})

test('revalidates restored image total size against the selected model input', async () => {
  const files = [new File(['12345'], 'reference.jpg', { type: 'image/jpeg' })]

  const error = await validateReferenceImages(files, {
    formats: ['image/jpeg'],
    maxTotalBytes: 4,
  })

  assert.equal(error, 'too-large')
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_REFERENCE_BYTES, validateReferenceImage } from '../validation'

test('rejects unsupported formats before loading the image', async () => {
  const file = new File(['data'], 'reference.gif', { type: 'image/gif' })

  assert.equal(await validateReferenceImage(file, 0, 0), 'unsupported')
})

test('rejects a fifth image while retaining the existing count', async () => {
  const file = new File(['data'], 'reference.png', { type: 'image/png' })

  assert.equal(await validateReferenceImage(file, 4, 0), 'too-many')
})

test('rejects a selection that exceeds the total size limit', async () => {
  const file = new File(['data'], 'reference.png', { type: 'image/png' })

  assert.equal(
    await validateReferenceImage(file, 0, MAX_REFERENCE_BYTES - file.size + 1),
    'too-large'
  )
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  MAX_IMAGE_BYTES,
  validateImageFile,
  type ImageValidationError,
} from '../image-validation'

describe('validateImageFile', () => {
  test('accepts supported images within the agreed limits', () => {
    assert.equal(
      validateImageFile(
        { size: MAX_IMAGE_BYTES, type: 'image/png' },
        { width: 4096, height: 4096 }
      ),
      null
    )
  })

  const invalidInputs: Array<{
    dimensions?: { width: number; height: number }
    expected: ImageValidationError
    file: { size: number; type: string }
  }> = [
    { file: { size: 1, type: 'image/gif' }, expected: 'format' },
    {
      file: { size: MAX_IMAGE_BYTES + 1, type: 'image/jpeg' },
      expected: 'size',
    },
    {
      file: { size: 1, type: 'image/webp' },
      dimensions: { width: 4097, height: 100 },
      expected: 'dimensions',
    },
  ]

  for (const input of invalidInputs) {
    test(`rejects invalid input with ${input.expected}`, () => {
      assert.equal(
        validateImageFile(input.file, input.dimensions),
        input.expected
      )
    })
  }
})

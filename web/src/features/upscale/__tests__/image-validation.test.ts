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
  MAX_IMAGE_LONG_EDGE,
  validateImageFile,
  type ImageValidationError,
} from '../image-validation'

function imageBitmap(width: number, height: number): ImageBitmap {
  return { width, height } as ImageBitmap
}

describe('validateImageFile', () => {
  test('accepts a supported image at the file-size and long-edge limits', () => {
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES)], 'image.png', {
      type: 'image/png',
    })

    assert.equal(validateImageFile(file, imageBitmap(1024, 512)), undefined)
  })

  const invalidInputs: Array<{
    bitmap?: ImageBitmap
    expected: ImageValidationError
    file: File
  }> = [
    {
      file: new File(['image'], 'image.gif', { type: 'image/gif' }),
      expected: 'format',
    },
    {
      file: new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'image.jpg', {
        type: 'image/jpeg',
      }),
      expected: 'size',
    },
    {
      file: new File(['image'], 'image.webp', { type: 'image/webp' }),
      bitmap: imageBitmap(MAX_IMAGE_LONG_EDGE + 1, 1),
      expected: 'dimensions',
    },
    {
      file: new File(['image'], 'image.webp', { type: 'image/webp' }),
      bitmap: imageBitmap(512, 1025),
      expected: 'dimensions',
    },
  ]

  for (const input of invalidInputs) {
    test(`rejects invalid input with ${input.expected}`, () => {
      assert.equal(validateImageFile(input.file, input.bitmap), input.expected)
    })
  }
})

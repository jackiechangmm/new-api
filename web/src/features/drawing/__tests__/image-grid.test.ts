import assert from 'node:assert/strict'
import test from 'node:test'

import { splitMidjourneyGrid } from '../image-grid'

test('Midjourney grid is split into U1 through U4 order', async () => {
  const originalCreateImageBitmap = Object.getOwnPropertyDescriptor(
    globalThis,
    'createImageBitmap'
  )
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document'
  )
  const draws: number[][] = []
  let closed = false

  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => ({
      width: 8,
      height: 6,
      close: () => {
        closed = true
      },
    }),
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (
            _source: unknown,
            sourceX: number,
            sourceY: number,
            sourceWidth: number,
            sourceHeight: number
          ) => {
            draws.push([sourceX, sourceY, sourceWidth, sourceHeight])
          },
        }),
        toBlob: (callback: (blob: Blob) => void) => {
          callback(new Blob(['tile'], { type: 'image/png' }))
        },
      }),
    },
  })

  try {
    const images = await splitMidjourneyGrid(
      new Blob(['grid'], { type: 'image/jpeg' })
    )

    assert.equal(images.length, 4)
    assert.ok(images.every((image) => image.type === 'image/png'))
    assert.deepEqual(draws, [
      [0, 0, 4, 3],
      [4, 0, 4, 3],
      [0, 3, 4, 3],
      [4, 3, 4, 3],
    ])
    assert.equal(closed, true)
  } finally {
    if (originalCreateImageBitmap) {
      Object.defineProperty(
        globalThis,
        'createImageBitmap',
        originalCreateImageBitmap
      )
    } else {
      Reflect.deleteProperty(globalThis, 'createImageBitmap')
    }
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument)
    } else {
      Reflect.deleteProperty(globalThis, 'document')
    }
  }
})

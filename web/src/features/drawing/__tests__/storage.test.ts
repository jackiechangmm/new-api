import { test, afterEach, beforeEach } from 'bun:test'
import assert from 'node:assert/strict'

import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'

import {
  deleteDrawingHistory,
  listDrawingHistory,
  saveDrawingHistory,
  type DrawingHistoryRecord,
} from '../storage'

const originalIndexedDB = globalThis.indexedDB

function record(
  id: string,
  createdAt: number,
  referenceImages?: Blob[]
): DrawingHistoryRecord {
  return {
    id,
    createdAt,
    prompt: `prompt-${id}`,
    model: 'gpt-image-2',
    size: '1:1 1k',
    quality: 'high',
    n: 2,
    images: [
      new Blob([`${id}-one`], { type: 'image/png' }),
      new Blob([`${id}-two`], { type: 'image/png' }),
    ],
    referenceImages,
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new IDBFactory(),
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: originalIndexedDB,
  })
})

test('drawing history preserves request images and returns newest records first', async () => {
  const older = record('older', 10)
  const newer = record('newer', 20, [
    new Blob(['reference'], { type: 'image/webp' }),
  ])

  assert.equal(await saveDrawingHistory(older), true)
  assert.equal(await saveDrawingHistory(newer), true)

  const saved = await listDrawingHistory()
  assert.deepEqual(
    saved.map((item) => item.id),
    ['newer', 'older']
  )
  assert.equal(saved[0]?.images.length, 2)
  assert.equal(saved[0]?.referenceImages?.length, 1)
  assert.equal(await saved[0]?.images[0]?.text(), 'newer-one')
  assert.equal(await saved[0]?.referenceImages?.[0]?.text(), 'reference')
})

test('drawing history deletes only the selected request', async () => {
  await saveDrawingHistory(record('keep', 10))
  await saveDrawingHistory(record('delete', 20))

  await deleteDrawingHistory('delete')

  assert.deepEqual(
    (await listDrawingHistory()).map((item) => item.id),
    ['keep']
  )
})

test('drawing history evicts the oldest request and retries a failed write', async () => {
  await saveDrawingHistory(record('oldest', 10))
  const prototype = IDBObjectStore.prototype as unknown as {
    put: (value: unknown, key?: IDBValidKey) => IDBRequest<IDBValidKey>
  }
  const originalPut = prototype.put
  let failNextPut = true
  prototype.put = function (value, key) {
    if (failNextPut) {
      failNextPut = false
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    }
    return key === undefined
      ? originalPut.call(this, value)
      : originalPut.call(this, value, key)
  }

  try {
    assert.equal(await saveDrawingHistory(record('newest', 20)), true)
  } finally {
    prototype.put = originalPut
  }

  assert.deepEqual(
    (await listDrawingHistory()).map((item) => item.id),
    ['newest']
  )
})

test('drawing history reports unavailable browser storage without throwing', async () => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: undefined,
  })

  assert.equal(await saveDrawingHistory(record('current', 10)), false)
})

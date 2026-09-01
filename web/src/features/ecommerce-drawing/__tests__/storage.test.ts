import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'

import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'

import { createDefaultDraft } from '../prompt-compiler'
import {
  clearEcommerceDraft,
  deleteEcommerceHistory,
  listEcommerceHistory,
  loadEcommerceDraft,
  saveEcommerceDraft,
  saveEcommerceHistory,
  type EcommerceHistoryRecord,
} from '../storage'

const originalIndexedDB = globalThis.indexedDB

function history(id: string, createdAt: number): EcommerceHistoryRecord {
  return {
    id,
    createdAt,
    images: [new Blob([id], { type: 'image/png' })],
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

test('ecommerce history is newest first and stores only display fields', async () => {
  await saveEcommerceHistory(history('older', 10))
  await saveEcommerceHistory(history('newer', 20))

  const records = await listEcommerceHistory()

  assert.deepEqual(
    records.map((record) => record.id),
    ['newer', 'older']
  )
  assert.deepEqual(Object.keys(records[0] ?? {}).sort(), [
    'createdAt',
    'id',
    'images',
  ])
  assert.equal(await records[0]?.images[0]?.text(), 'newer')
})

test('ecommerce history deletes only the selected result', async () => {
  await saveEcommerceHistory(history('keep', 10))
  await saveEcommerceHistory(history('delete', 20))

  await deleteEcommerceHistory('delete')

  assert.deepEqual(
    (await listEcommerceHistory()).map((record) => record.id),
    ['keep']
  )
})

test('history evicts the oldest result and retries after quota failure', async () => {
  await saveEcommerceHistory(history('oldest', 10))
  const prototype = IDBObjectStore.prototype as unknown as {
    put: (value: unknown, key?: IDBValidKey) => IDBRequest<IDBValidKey>
  }
  const originalPut = prototype.put
  let failNext = true
  prototype.put = function (value, key) {
    if (failNext) {
      failNext = false
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    }
    return key === undefined
      ? originalPut.call(this, value)
      : originalPut.call(this, value, key)
  }

  try {
    assert.equal(await saveEcommerceHistory(history('newest', 20)), true)
  } finally {
    prototype.put = originalPut
  }

  assert.deepEqual(
    (await listEcommerceHistory()).map((record) => record.id),
    ['newest']
  )
})

test('draft restores form, step, settings, and image while reset leaves history intact', async () => {
  const draft = {
    ...createDefaultDraft(),
    name: '通勤包',
    productImage: new File(['product'], 'product.webp', {
      type: 'image/webp',
    }),
  }
  await saveEcommerceHistory(history('result', 10))
  await saveEcommerceDraft({
    draft,
    unlockedStep: 4,
    settings: { aspectRatio: '4:5', resolution: '2k', quality: 'high' },
  })

  const restored = await loadEcommerceDraft()

  assert.equal(restored?.draft.name, '通勤包')
  assert.equal(restored?.unlockedStep, 4)
  assert.equal(restored?.settings.aspectRatio, '4:5')
  assert.equal(await restored?.draft.productImage?.text(), 'product')

  await clearEcommerceDraft()
  assert.equal(await loadEcommerceDraft(), undefined)
  assert.equal((await listEcommerceHistory()).length, 1)
})

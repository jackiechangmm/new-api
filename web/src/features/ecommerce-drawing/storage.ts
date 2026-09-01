import type { EcommerceDraft, GenerationSettings, StepNumber } from './types'

export interface EcommerceHistoryRecord {
  id: string
  createdAt: number
  images: Blob[]
}

export interface EcommerceDraftRecord {
  draft: EcommerceDraft
  unlockedStep: StepNumber
  settings: GenerationSettings
}

const DB_NAME = 'new-api-ecommerce-drawing'
const DB_VERSION = 1
const HISTORY_STORE = 'history'
const DRAFT_STORE = 'draft'
const DRAFT_KEY = 'current'

type StoredDraft = EcommerceDraftRecord & { id: string }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listEcommerceHistory(): Promise<
  EcommerceHistoryRecord[]
> {
  const db = await openDatabase()
  try {
    const records = await requestResult<EcommerceHistoryRecord[]>(
      db.transaction(HISTORY_STORE).objectStore(HISTORY_STORE).getAll()
    )
    return records.sort((left, right) => right.createdAt - left.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteEcommerceHistory(id: string): Promise<void> {
  const db = await openDatabase()
  try {
    await requestResult(
      db
        .transaction(HISTORY_STORE, 'readwrite')
        .objectStore(HISTORY_STORE)
        .delete(id)
    )
  } finally {
    db.close()
  }
}

export async function saveEcommerceHistory(
  record: EcommerceHistoryRecord
): Promise<boolean> {
  try {
    const db = await openDatabase()
    try {
      try {
        await requestResult(
          db
            .transaction(HISTORY_STORE, 'readwrite')
            .objectStore(HISTORY_STORE)
            .put(record)
        )
        return true
      } catch {
        const records = await listEcommerceHistory()
        const oldest = records.at(-1)
        if (!oldest || oldest.id === record.id) return false
        await deleteEcommerceHistory(oldest.id)
        const retryDb = await openDatabase()
        try {
          await requestResult(
            retryDb
              .transaction(HISTORY_STORE, 'readwrite')
              .objectStore(HISTORY_STORE)
              .put(record)
          )
          return true
        } finally {
          retryDb.close()
        }
      }
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

export async function saveEcommerceDraft(
  record: EcommerceDraftRecord
): Promise<boolean> {
  try {
    const db = await openDatabase()
    try {
      await requestResult(
        db
          .transaction(DRAFT_STORE, 'readwrite')
          .objectStore(DRAFT_STORE)
          .put({ id: DRAFT_KEY, ...record })
      )
      return true
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

export async function loadEcommerceDraft(): Promise<
  EcommerceDraftRecord | undefined
> {
  try {
    const db = await openDatabase()
    try {
      const stored = await requestResult<StoredDraft | undefined>(
        db.transaction(DRAFT_STORE).objectStore(DRAFT_STORE).get(DRAFT_KEY)
      )
      if (!stored) return undefined
      return {
        draft: stored.draft,
        unlockedStep: stored.unlockedStep,
        settings: stored.settings,
      }
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

export async function clearEcommerceDraft(): Promise<void> {
  try {
    const db = await openDatabase()
    try {
      await requestResult(
        db
          .transaction(DRAFT_STORE, 'readwrite')
          .objectStore(DRAFT_STORE)
          .delete(DRAFT_KEY)
      )
    } finally {
      db.close()
    }
  } catch {
    // Reset remains usable when browser storage is unavailable.
  }
}

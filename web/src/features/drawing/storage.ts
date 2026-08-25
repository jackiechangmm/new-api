export interface DrawingHistoryRecord {
  id: string
  createdAt: number
  prompt: string
  model: string
  group: string
  size: string
  quality: string
  n: number
  images: Blob[]
  referenceImages?: Blob[]
}

const DB_NAME = 'new-api-drawing'
const STORE_NAME = 'history'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
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

export async function listDrawingHistory(): Promise<DrawingHistoryRecord[]> {
  const db = await openDatabase()
  try {
    const records = await requestResult<DrawingHistoryRecord[]>(
      db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()
    )
    return records.sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function deleteDrawingHistory(id: string): Promise<void> {
  const db = await openDatabase()
  try {
    await requestResult(
      db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id)
    )
  } finally {
    db.close()
  }
}

export async function saveDrawingHistory(
  record: DrawingHistoryRecord
): Promise<boolean> {
  try {
    const db = await openDatabase()
    try {
      try {
        await requestResult(
          db
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .put(record)
        )
        return true
      } catch {
        const records = await listDrawingHistory()
        const oldest = records.at(-1)
        if (!oldest || oldest.id === record.id) return false
        await deleteDrawingHistory(oldest.id)
        const retryDb = await openDatabase()
        try {
          await requestResult(
            retryDb
              .transaction(STORE_NAME, 'readwrite')
              .objectStore(STORE_NAME)
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

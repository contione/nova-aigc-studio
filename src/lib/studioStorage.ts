export type StudioAsset = {
  id: string
  dataUrl: string
  title: string
  prompt: string
  model: string
  ratio: string
  createdAt: string
  favorite: boolean
  source: 'generated' | 'upload' | 'canvas'
}

export type StoredCanvas = {
  id: string
  name: string
  updatedAt: string
  payload: unknown
}

const DATABASE_NAME = 'nova-aigc-studio'
const DATABASE_VERSION = 1
const ASSETS_STORE = 'assets'
const CANVASES_STORE = 'canvases'
const STORAGE_SIGNAL_KEY = 'nova-aigc-studio:storage-change'
const STORAGE_CHANNEL_NAME = 'nova-aigc-studio:storage'
const MAX_CANVAS_PAYLOAD_BYTES = 80 * 1024 * 1024
const MAX_ASSET_DATA_URL_BYTES = 28 * 1024 * 1024

const listeners = new Set<() => void>()
let databasePromise: Promise<IDBDatabase> | undefined
let broadcastChannel: BroadcastChannel | undefined
let storageListenerInstalled = false

function getIndexedDb(): IDBFactory {
  if (typeof indexedDB === 'undefined') {
    throw new Error('当前浏览器不支持本地存储')
  }
  return indexedDB
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = getIndexedDb().open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地工作室存储'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(ASSETS_STORE)) database.createObjectStore(ASSETS_STORE, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(CANVASES_STORE)) database.createObjectStore(CANVASES_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        if (databasePromise === promise) databasePromise = undefined
      }
      resolve(database)
    }
  })
  databasePromise = promise
  promise.catch(() => {
    if (databasePromise === promise) databasePromise = undefined
  })

  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('本地存储请求失败'))
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('本地存储事务失败'))
    transaction.onabort = () => reject(transaction.error ?? new Error('本地存储事务已中止'))
  })
}

function notifySubscribers(): void {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
    }
  })
}

function ensureSyncChannel(): void {
  if (typeof window === 'undefined' || storageListenerInstalled) return
  storageListenerInstalled = true

  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(STORAGE_CHANNEL_NAME)
    broadcastChannel.onmessage = () => notifySubscribers()
  }

  window.addEventListener('storage', (event) => {
    if (!broadcastChannel && event.key === STORAGE_SIGNAL_KEY) notifySubscribers()
  })
}

function announceChange(): void {
  ensureSyncChannel()
  notifySubscribers()
  if (broadcastChannel) {
    broadcastChannel.postMessage({ changedAt: Date.now() })
    return
  }
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_SIGNAL_KEY, String(Date.now()))
  } catch {
  }
}

function serializedSize(value: unknown): number {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new Error('画布数据格式无法保存')
  }
  if (serialized === undefined) return 0
  return new TextEncoder().encode(serialized).byteLength
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeAsset(value: unknown): StudioAsset | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  const source = value.source === 'upload' || value.source === 'canvas' || value.source === 'generated' ? value.source : 'generated'
  return {
    id: value.id,
    dataUrl: typeof value.dataUrl === 'string' ? value.dataUrl : '',
    title: typeof value.title === 'string' && value.title ? value.title : '未命名资产',
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    model: typeof value.model === 'string' && value.model ? value.model : '未知模型',
    ratio: typeof value.ratio === 'string' && value.ratio ? value.ratio : '自定义',
    createdAt: typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : new Date(0).toISOString(),
    favorite: value.favorite === true,
    source,
  }
}

export async function listAssets(): Promise<StudioAsset[]> {
  const database = await openDatabase()
  const transaction = database.transaction(ASSETS_STORE, 'readonly')
  const request = requestResult<unknown[]>(transaction.objectStore(ASSETS_STORE).getAll())
  const complete = transactionComplete(transaction)
  const [records] = await Promise.all([request, complete])
  const assets = records.map(normalizeAsset).filter((asset): asset is StudioAsset => asset !== null)
  return assets.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function saveAssets(assets: StudioAsset[]): Promise<void> {
  const normalizedAssets = assets.map(normalizeAsset).filter((asset): asset is StudioAsset => asset !== null)
  normalizedAssets.forEach((asset) => {
    if (serializedSize(asset.dataUrl) > MAX_ASSET_DATA_URL_BYTES) throw new Error('图片数据超过本地 28 MiB 限制')
  })

  const database = await openDatabase()
  const transaction = database.transaction(ASSETS_STORE, 'readwrite')
  const store = transaction.objectStore(ASSETS_STORE)
  normalizedAssets.forEach((asset) => store.put(asset))
  await transactionComplete(transaction)
  announceChange()
}

export async function deleteAsset(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(ASSETS_STORE, 'readwrite')
  transaction.objectStore(ASSETS_STORE).delete(id)
  await transactionComplete(transaction)
  announceChange()
}

export async function listCanvases(): Promise<StoredCanvas[]> {
  const database = await openDatabase()
  const transaction = database.transaction(CANVASES_STORE, 'readonly')
  const request = requestResult(transaction.objectStore(CANVASES_STORE).getAll())
  const complete = transactionComplete(transaction)
  const [canvases] = await Promise.all([request, complete])
  return canvases.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function getCanvas(id: string): Promise<StoredCanvas | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(CANVASES_STORE, 'readonly')
  const request = requestResult(transaction.objectStore(CANVASES_STORE).get(id))
  const complete = transactionComplete(transaction)
  const [canvas] = await Promise.all([request, complete])
  return canvas
}

export async function saveCanvas(record: StoredCanvas): Promise<void> {
  if (serializedSize(record.payload) > MAX_CANVAS_PAYLOAD_BYTES) {
    throw new Error('画布数据超过本地 80 MiB 限制')
  }

  const database = await openDatabase()
  const transaction = database.transaction(CANVASES_STORE, 'readwrite')
  transaction.objectStore(CANVASES_STORE).put(record)
  await transactionComplete(transaction)
  announceChange()
}

export async function deleteCanvas(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(CANVASES_STORE, 'readwrite')
  transaction.objectStore(CANVASES_STORE).delete(id)
  await transactionComplete(transaction)
  announceChange()
}

export function subscribeStudioStorage(listener: () => void): () => void {
  listeners.add(listener)
  ensureSyncChannel()
  return () => listeners.delete(listener)
}

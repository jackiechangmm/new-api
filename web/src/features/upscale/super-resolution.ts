/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import type * as ortType from 'onnxruntime-web'

const MODEL_URL =
  'https://bululu-assets.cn-nb1.rains3.com/playground/models/realesrgan-x4.onnx'
const DATABASE_NAME = 'upscale'
const MODEL_KEY = 'realesrgan-x4-rains3'

export type UpscaleProgress = {
  phase: 'loading-model' | 'upscaling'
  progress: number
}

type ProgressHandler = (progress: UpscaleProgress) => void

let session: ortType.InferenceSession | undefined

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}

function openModelDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore('models')
    })
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    })
  })
}

async function readCachedModel(): Promise<ArrayBuffer | undefined> {
  const database = await openModelDatabase()
  return new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    const request = database
      .transaction('models', 'readonly')
      .objectStore('models')
      .get(MODEL_KEY)
    request.addEventListener(
      'success',
      () => resolve(request.result as ArrayBuffer | undefined),
      { once: true }
    )
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    })
  }).finally(() => database.close())
}

async function cacheModel(model: ArrayBuffer): Promise<void> {
  const database = await openModelDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction('models', 'readwrite')
      .objectStore('models')
      .put(model, MODEL_KEY)
    request.addEventListener('success', () => resolve(), { once: true })
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    })
  })
  database.close()
}

async function downloadModel(
  onProgress: ProgressHandler,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const response = await fetch(MODEL_URL, { signal })
  if (!response.ok || !response.body) throw new Error('model-download-failed')

  const total = Number(response.headers.get('content-length'))
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let downloaded = 0

  while (true) {
    throwIfAborted(signal)
    const result = await reader.read()
    if (result.done) break
    chunks.push(result.value)
    downloaded += result.value.byteLength
    if (total) {
      onProgress({
        phase: 'loading-model',
        progress: Math.round((downloaded / total) * 100),
      })
    }
  }

  const model = new Uint8Array(downloaded)
  let offset = 0
  for (const chunk of chunks) {
    model.set(chunk, offset)
    offset += chunk.byteLength
  }
  return model.buffer
}

async function loadModel(
  onProgress: ProgressHandler,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const cached = await readCachedModel()
  throwIfAborted(signal)
  if (cached) {
    onProgress({ phase: 'loading-model', progress: 100 })
    return cached
  }

  const model = await downloadModel(onProgress, signal)
  throwIfAborted(signal)
  await cacheModel(model)
  onProgress({ phase: 'loading-model', progress: 100 })
  return model
}

async function getSession(
  onProgress: ProgressHandler,
  signal?: AbortSignal
): Promise<ortType.InferenceSession> {
  throwIfAborted(signal)
  if (session) {
    onProgress({ phase: 'loading-model', progress: 100 })
    return session
  }

  const ort = await import('onnxruntime-web/webgpu')
  ort.env.wasm.numThreads = 1
  const model = await loadModel(onProgress, signal)
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> }
    }
  ).gpu
  const supportsWebGpu = gpu ? Boolean(await gpu.requestAdapter()) : false
  if (!supportsWebGpu && typeof WebAssembly !== 'object') {
    throw new Error('browser-unsupported')
  }
  throwIfAborted(signal)
  session = await ort.InferenceSession.create(model, {
    executionProviders: [supportsWebGpu ? 'webgpu' : 'wasm'],
  })
  return session
}

// 将图像数据从 HWC 格式转换为 CHW 格式并归一化
function imageToTensor(imageData: ImageData): {
  data: Float32Array
  shape: [number, number, number, number]
} {
  const { width, height, data } = imageData
  const channelData = new Float32Array(width * height * 3)
  const pixelCount = width * height

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4
    // RGB 通道，归一化到 [0, 1]
    channelData[i] = data[offset] / 255.0
    channelData[pixelCount + i] = data[offset + 1] / 255.0
    channelData[pixelCount * 2 + i] = data[offset + 2] / 255.0
  }

  return {
    data: channelData,
    shape: [1, 3, height, width],
  }
}

// 将张量从 CHW 格式转换回 HWC 格式的 ImageData
function tensorToImage(
  tensorData: Float32Array,
  width: number,
  height: number
): ImageData {
  const pixelCount = width * height
  const imageData = new ImageData(width, height)

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4
    // 反归一化并限制在 [0, 255]
    imageData.data[offset] = Math.max(
      0,
      Math.min(255, Math.round(tensorData[i] * 255))
    )
    imageData.data[offset + 1] = Math.max(
      0,
      Math.min(255, Math.round(tensorData[pixelCount + i] * 255))
    )
    imageData.data[offset + 2] = Math.max(
      0,
      Math.min(255, Math.round(tensorData[pixelCount * 2 + i] * 255))
    )
    imageData.data[offset + 3] = 255
  }

  return imageData
}

// 分块处理图像
async function processTiles(
  inputTensor: Float32Array,
  inputShape: [number, number, number, number],
  inferenceSession: ortType.InferenceSession,
  onProgress: ProgressHandler,
  signal?: AbortSignal
) {
  const ort = await import('onnxruntime-web/webgpu')
  const [, , inputHeight, inputWidth] = inputShape
  const tileSize = 64
  const tilePadding = 6
  const tileSizePre = tileSize - tilePadding * 2
  const scale = 4

  const tilesX = Math.ceil(inputWidth / tileSizePre)
  const tilesY = Math.ceil(inputHeight / tileSizePre)
  const totalTiles = tilesX * tilesY

  const outputWidth = inputWidth * scale
  const outputHeight = inputHeight * scale
  const outputData = new Float32Array(outputWidth * outputHeight * 3)
  const outputPixelCount = outputWidth * outputHeight

  let processedTiles = 0

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      throwIfAborted(signal)
      // 计算实际块大小
      const tileW = Math.min(tileSizePre, inputWidth - tx * tileSizePre)
      const tileH = Math.min(tileSizePre, inputHeight - ty * tileSizePre)

      // 提取带 padding 的块
      const tileData = new Float32Array(tileSize * tileSize * 3)
      const tilePixelCount = tileSize * tileSize

      for (let c = 0; c < 3; c++) {
        for (let y = 0; y < tileSize; y++) {
          for (let x = 0; x < tileSize; x++) {
            // 计算在原图中的坐标，处理边界
            let srcX = tx * tileSizePre + x - tilePadding
            let srcY = ty * tileSizePre + y - tilePadding
            srcX = Math.max(0, Math.min(inputWidth - 1, srcX))
            srcY = Math.max(0, Math.min(inputHeight - 1, srcY))

            const srcIdx =
              srcY * inputWidth + srcX + c * inputWidth * inputHeight
            const dstIdx = y * tileSize + x + c * tilePixelCount
            tileData[dstIdx] = inputTensor[srcIdx]
          }
        }
      }

      // 推理
      const tileTensor = new ort.Tensor('float32', tileData, [
        1,
        3,
        tileSize,
        tileSize,
      ])
      const result = await inferenceSession.run({
        [inferenceSession.inputNames[0]]: tileTensor,
      })
      const outputTile = result[inferenceSession.outputNames[0]]
        .data as Float32Array

      // 将结果写入输出（去掉 padding）
      const outTileSize = tileSize * scale
      const outTileSizePre = tileSizePre * scale
      const outTileW = tileW * scale
      const outTileH = tileH * scale

      for (let c = 0; c < 3; c++) {
        for (let y = 0; y < outTileH; y++) {
          for (let x = 0; x < outTileW; x++) {
            const srcX = x + tilePadding * scale
            const srcY = y + tilePadding * scale
            const srcIdx =
              srcY * outTileSize + srcX + c * outTileSize * outTileSize

            const dstX = tx * outTileSizePre + x
            const dstY = ty * outTileSizePre + y
            const dstIdx = dstY * outputWidth + dstX + c * outputPixelCount

            outputData[dstIdx] = outputTile[srcIdx]
          }
        }
      }

      processedTiles++
      onProgress({
        phase: 'upscaling',
        progress: Math.round((processedTiles / totalTiles) * 100),
      })
    }
  }

  return { data: outputData, width: outputWidth, height: outputHeight }
}

export async function upscaleImage(
  sourceUrl: string,
  onProgress: ProgressHandler,
  signal?: AbortSignal
): Promise<{ blobUrl: string; width: number; height: number }> {
  const inferenceSession = await getSession(onProgress, signal)
  throwIfAborted(signal)
  onProgress({ phase: 'upscaling', progress: 0 })

  // 加载图像
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener(
      'error',
      () => reject(new Error('image-load-failed')),
      { once: true }
    )
    image.src = sourceUrl
  })

  // 将图像绘制到 canvas 获取 ImageData
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas-context-failed')
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, img.width, img.height)

  // 转换为张量
  const inputTensor = imageToTensor(imageData)

  // 分块处理
  const result = await processTiles(
    inputTensor.data,
    inputTensor.shape,
    inferenceSession,
    onProgress,
    signal
  )

  // 转换回 ImageData
  const outputImageData = tensorToImage(
    result.data,
    result.width,
    result.height
  )
  throwIfAborted(signal)

  // 生成输出图像
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = result.width
  outputCanvas.height = result.height
  const outputCtx = outputCanvas.getContext('2d')
  if (!outputCtx) throw new Error('canvas-context-failed')
  outputCtx.putImageData(outputImageData, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('image-export-failed'))
    }, 'image/png')
  })

  throwIfAborted(signal)
  return {
    blobUrl: URL.createObjectURL(blob),
    width: result.width,
    height: result.height,
  }
}

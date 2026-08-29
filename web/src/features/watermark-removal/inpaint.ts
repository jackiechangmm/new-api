/*
Copyright (C) 2023-2026 QuantumNous

This file includes adapted work from inpaint-web:
https://github.com/lxfater/inpaint-web
Copyright (C) lxfater and contributors, licensed under GPL-3.0.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import type * as ortType from 'onnxruntime-web'

const MODEL_URL =
  'https://gh-proxy.org/https://raw.githubusercontent.com/Rootport-AI/MI-GAN-Eraser/main/migan_pipeline_v2.onnx'
const MODEL_DOWNLOAD_PARTS = 8
const DATABASE_NAME = 'watermark-removal'
const MODEL_KEY = 'migan-pipeline-v2'

let session: ortType.InferenceSession | undefined

function openModelDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('models')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readCachedModel(): Promise<ArrayBuffer | undefined> {
  const database = await openModelDatabase()
  return new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    const request = database
      .transaction('models', 'readonly')
      .objectStore('models')
      .get(MODEL_KEY)
    request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined)
    request.onerror = () => reject(request.error)
  }).finally(() => database.close())
}

async function cacheModel(model: ArrayBuffer): Promise<void> {
  const database = await openModelDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction('models', 'readwrite')
      .objectStore('models')
      .put(model, MODEL_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  database.close()
}

async function downloadModel(onProgress: (progress: number) => void) {
  const download = async (response: Response, report: (bytes: number) => void) => {
    if (!response.ok || !response.body) throw new Error('model-download-failed')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let downloaded = 0

    while (true) {
      const result = await reader.read()
      if (result.done) break
      chunks.push(result.value)
      downloaded += result.value.byteLength
      report(result.value.byteLength)
    }

    const data = new Uint8Array(downloaded)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.byteLength
    }
    return data
  }

  try {
    const metadata = await fetch(MODEL_URL, { method: 'HEAD' })
    const total = Number(metadata.headers.get('content-length'))
    if (!metadata.ok || !total) throw new Error('range-download-unavailable')

    const controller = new AbortController()
    let downloaded = 0
    try {
      const parts = await Promise.all(
        Array.from({ length: MODEL_DOWNLOAD_PARTS }, async (_, index) => {
          const start = Math.floor((total * index) / MODEL_DOWNLOAD_PARTS)
          const end = Math.floor((total * (index + 1)) / MODEL_DOWNLOAD_PARTS) - 1
          const response = await fetch(MODEL_URL, {
            headers: { Range: `bytes=${start}-${end}` },
            signal: controller.signal,
          })
          if (response.status !== 206) throw new Error('range-download-unavailable')
          const part = await download(response, (bytes) => {
            downloaded += bytes
            onProgress(Math.round((downloaded / total) * 100))
          })
          if (part.byteLength !== end - start + 1) {
            throw new Error('range-download-incomplete')
          }
          return part
        })
      )
      const model = new Uint8Array(total)
      let offset = 0
      for (const part of parts) {
        model.set(part, offset)
        offset += part.byteLength
      }
      return model.buffer
    } catch (error) {
      controller.abort()
      throw error
    }
  } catch {
    let downloaded = 0
    const response = await fetch(MODEL_URL)
    const total = Number(response.headers.get('content-length'))
    const model = await download(response, (bytes) => {
      downloaded += bytes
      if (total) onProgress(Math.round((downloaded / total) * 100))
    })
    return model.buffer
  }
}

async function loadModel(onProgress: (progress: number) => void) {
  const cached = await readCachedModel()
  if (cached) {
    onProgress(100)
    return cached
  }

  const model = await downloadModel(onProgress)
  await cacheModel(model)
  onProgress(100)
  return model
}

async function getSession(onProgress: (progress: number) => void) {
  if (session) {
    onProgress(100)
    return session
  }

  const ort = await import('onnxruntime-web/webgpu')
  ort.env.wasm.numThreads = 1
  const model = await loadModel(onProgress)
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> }
    }
  ).gpu
  const supportsWebGpu = gpu ? Boolean(await gpu.requestAdapter()) : false
  if (!supportsWebGpu && typeof WebAssembly !== 'object') {
    throw new Error('browser-unsupported')
  }
  session = await ort.InferenceSession.create(model, {
    executionProviders: [supportsWebGpu ? 'webgpu' : 'wasm'],
  })
  return session
}

export async function removeWatermark(
  image: ImageData,
  mask: Uint8Array,
  onProgress: (progress: number) => void
): Promise<Blob> {
  const ort = await import('onnxruntime-web/webgpu')
  const inferenceSession = await getSession(onProgress)
  const pixelCount = image.width * image.height
  const rgb = new Uint8Array(pixelCount * 3)

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const source = pixel * 4
    rgb[pixel] = image.data[source]
    rgb[pixelCount + pixel] = image.data[source + 1]
    rgb[pixelCount * 2 + pixel] = image.data[source + 2]
  }

  const result = await inferenceSession.run({
    [inferenceSession.inputNames[0]]: new ort.Tensor('uint8', rgb, [
      1,
      3,
      image.height,
      image.width,
    ]),
    [inferenceSession.inputNames[1]]: new ort.Tensor('uint8', mask, [
      1,
      1,
      image.height,
      image.width,
    ]),
  })
  const output = result[inferenceSession.outputNames[0]].data as Uint8Array
  const rendered = new ImageData(image.width, image.height)

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const target = pixel * 4
    rendered.data[target] = output[pixel]
    rendered.data[target + 1] = output[pixelCount + pixel]
    rendered.data[target + 2] = output[pixelCount * 2 + pixel]
    rendered.data[target + 3] = 255
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')?.putImageData(rendered, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('image-export-failed'))
    }, 'image/png')
  })
}

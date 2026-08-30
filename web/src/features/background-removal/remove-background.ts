/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import { env } from '@huggingface/transformers'

const MODEL_HOST = 'https://bululu-assets.cn-nb1.rains3.com/playground/models/'

env.allowLocalModels = false
env.allowRemoteModels = true
env.remoteHost = MODEL_HOST
env.remotePathTemplate = '{model}/resolve/{revision}/'

export async function removeImageBackground(
  sourceUrl: string,
  onProgress: (progress: number) => void
) {
  if (typeof WebAssembly === 'undefined' && !('gpu' in globalThis.navigator)) {
    throw new Error('browser-unsupported')
  }

  const { init, removeBackground, subscribeToProgress } =
    await import('rembg-webgpu')
  const unsubscribe = subscribeToProgress((state) => {
    onProgress(state.progress)
  })

  try {
    const initialization = init()
    // rembg 补丁 window.fetch 后，将 Transformers v4 的已绑定 fetch 同步过去。
    env.fetch = globalThis.fetch.bind(globalThis)
    await initialization
    return await removeBackground(sourceUrl)
  } finally {
    unsubscribe()
  }
}

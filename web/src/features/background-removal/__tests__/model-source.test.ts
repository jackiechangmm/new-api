/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import { test } from 'bun:test'
import assert from 'node:assert/strict'

import { env } from '@huggingface/transformers'

test('background removal loads models only from the Rains3 mirror', async () => {
  await import('../remove-background')

  assert.equal(env.allowLocalModels, false)
  assert.equal(env.allowRemoteModels, true)
  assert.equal(
    env.remoteHost,
    'https://bululu-assets.cn-nb1.rains3.com/playground/models/'
  )
  assert.equal(env.remotePathTemplate, '{model}/resolve/{revision}/')
})

test('background removal rejects browsers without WebGPU and WebAssembly', async () => {
  const originalWebAssembly = globalThis.WebAssembly
  Object.defineProperty(globalThis, 'WebAssembly', {
    configurable: true,
    value: undefined,
  })

  try {
    const { removeImageBackground } = await import('../remove-background')
    await assert.rejects(
      removeImageBackground('blob:test', () => undefined),
      /browser-unsupported/
    )
  } finally {
    Object.defineProperty(globalThis, 'WebAssembly', {
      configurable: true,
      value: originalWebAssembly,
    })
  }
})

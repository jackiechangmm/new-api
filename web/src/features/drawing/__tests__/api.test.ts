import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

import { api } from '@/lib/api'

import {
  getDrawingModels,
  polishDrawingPrompt,
  requestDrawingImages,
  requestMidjourneyImage,
} from '../api'

type ApiResponse = Promise<{ data: unknown }>
type ApiClient = {
  get: (url: string, config?: unknown) => ApiResponse
  post: (url: string, data?: unknown, config?: unknown) => ApiResponse
}

const client = api as unknown as ApiClient
const originalGet = client.get
const originalPost = client.post

afterEach(() => {
  client.get = originalGet
  client.post = originalPost
})

test('Midjourney drawing prefers the individual upstream images', async () => {
  const requests: Array<{ method: string; url: string; data: unknown }> = []
  const image = new Blob(['image'], { type: 'image/png' })
  client.post = async (url, data) => {
    requests.push({ method: 'POST', url, data })
    return { data: { code: 1, result: 'mj-task-1' } }
  }
  let taskPolls = 0
  client.get = async (url, config) => {
    requests.push({ method: 'GET', url, data: config })
    if (url.includes('/fetch')) {
      taskPolls++
      return {
        data: {
          id: 'mj-task-1',
          status: taskPolls === 1 ? 'IN_PROGRESS' : 'SUCCESS',
          progress: taskPolls === 1 ? '50%' : '100%',
          imageUrl: 'https://upstream.example/grid.png',
          videoUrls: [
            { url: 'https://upstream.example/image-1.png' },
            { url: 'https://upstream.example/image-2.png' },
          ],
        },
      }
    }
    return { data: image }
  }
  const progress: string[] = []
  const reference = new File(['reference'], 'reference.png', {
    type: 'image/png',
  })

  const result = await requestMidjourneyImage(
    'draw a lighthouse',
    [reference],
    {
      pollIntervalMs: 0,
      onProgress: (value) => progress.push(value),
    }
  )

  assert.deepEqual(requests[0], {
    method: 'POST',
    url: '/mj/submit/imagine',
    data: {
      prompt: 'draw a lighthouse',
      base64Array: ['data:image/png;base64,cmVmZXJlbmNl'],
    },
  })
  assert.deepEqual(progress, ['50%', '100%'])
  assert.equal(result.taskId, 'mj-task-1')
  assert.deepEqual(result.images, [image, image])
  assert.equal(result.usedOriginalGrid, false)
  assert.equal(requests[3]?.url, '/mj/image/mj-task-1?index=0')
  assert.equal(requests[4]?.url, '/mj/image/mj-task-1?index=1')
  assert.deepEqual(requests[3]?.data, {
    signal: undefined,
    responseType: 'blob',
    skipErrorHandler: true,
    disableDuplicate: true,
  })
})

test('Midjourney drawing keeps the original grid when splitting fails', async () => {
  const originalCreateImageBitmap = Object.getOwnPropertyDescriptor(
    globalThis,
    'createImageBitmap'
  )
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => {
      throw new Error('decode failed')
    },
  })
  const grid = new Blob(['grid'], { type: 'image/png' })
  client.post = async () => ({ data: { code: 1, result: 'mj-grid-task' } })
  client.get = async (url) => {
    if (url.includes('/fetch')) {
      return {
        data: {
          id: 'mj-grid-task',
          status: 'SUCCESS',
          progress: '100%',
          imageUrl: 'https://upstream.example/grid.png',
        },
      }
    }
    return { data: grid }
  }

  try {
    const result = await requestMidjourneyImage('draw four scenes', [], {
      pollIntervalMs: 0,
    })

    assert.deepEqual(result.images, [grid])
    assert.equal(result.usedOriginalGrid, true)
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
  }
})

test('Midjourney drawing rejects a failed task without exposing upstream details', async () => {
  client.post = async () => ({
    data: { code: 1, result: 'mj-failed-task' },
  })
  client.get = async () => ({
    data: {
      id: 'mj-failed-task',
      status: 'FAILURE',
      progress: '100%',
      failReason: 'provider internal error',
    },
  })

  await assert.rejects(
    requestMidjourneyImage('draw a lighthouse', [], { pollIntervalMs: 0 }),
    { message: 'Image generation failed' }
  )
})

test('text drawing sends the OpenAI image generation contract', async () => {
  let request: { url: string; data: unknown; config: unknown } | undefined
  client.post = async (url, data, config) => {
    request = { url, data, config }
    return { data: { data: [{ b64_json: 'aW1hZ2U=' }] } }
  }
  const payload = {
    model: 'gpt-image-2',
    prompt: 'draw a lighthouse',
    size: '16:9 2k',
    quality: 'high',
    n: 2,
    response_format: 'b64_json' as const,
  }

  const result = await requestDrawingImages('openai-image', payload)

  assert.equal(request?.url, '/v1/images/generations')
  assert.deepEqual(request?.data, payload)
  assert.deepEqual(request?.config, {
    signal: undefined,
    skipErrorHandler: true,
  })
  assert.equal(result.data?.[0]?.b64_json, 'aW1hZ2U=')
})

test('reference drawing sends images through the OpenAI multipart contract', async () => {
  let formData: FormData | undefined
  client.post = async (url, data) => {
    assert.equal(url, '/v1/images/edits')
    assert.ok(data instanceof FormData)
    formData = data
    return { data: { data: [] } }
  }
  const reference = new File(['reference'], 'reference.png', {
    type: 'image/png',
  })

  await requestDrawingImages('openai-image', {
    model: 'gpt-image-2',
    prompt: 'change the sky',
    size: '1:1 1k',
    quality: 'medium',
    n: 1,
    response_format: 'b64_json',
    images: [reference],
  })

  assert.equal(formData?.get('model'), 'gpt-image-2')
  assert.equal(formData?.get('prompt'), 'change the sky')
  assert.equal(formData?.get('size'), '1:1 1k')
  assert.equal(formData?.get('quality'), 'medium')
  assert.equal(formData?.get('n'), '1')
  assert.equal(formData?.get('response_format'), 'b64_json')
  const uploaded = formData?.get('image[]')
  assert.ok(uploaded instanceof File)
  assert.equal(uploaded.name, 'reference.png')
})

test('Gemini drawing sends inline references and returns the generated image', async () => {
  let request: { url: string; data: unknown } | undefined
  client.post = async (url, data) => {
    request = { url, data }
    return {
      data: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'done' },
                { inlineData: { data: 'cmVzdWx0', mimeType: 'image/webp' } },
              ],
            },
          },
        ],
      },
    }
  }

  const result = await requestDrawingImages('gemini-generate-content', {
    model: 'nano-banana-2',
    prompt: 'use this reference',
    size: '16:9 2k',
    n: 1,
    response_format: 'b64_json',
    images: [new File(['ref'], 'ref.png', { type: 'image/png' })],
  })

  assert.equal(request?.url, '/v1beta/models/nano-banana-2:generateContent')
  assert.deepEqual(request?.data, {
    contents: [
      {
        parts: [
          { text: 'use this reference' },
          { inlineData: { data: 'cmVm', mimeType: 'image/png' } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
    },
  })
  assert.deepEqual(result, {
    data: [{ b64_json: 'cmVzdWx0', mime_type: 'image/webp' }],
  })
})

test('drawing prompt polishing uses the selected upstream template in two multimodal calls', async () => {
  const requests: Array<{ data: unknown; config: unknown }> = []
  client.post = async (url, data, config) => {
    assert.equal(url, '/v1/chat/completions')
    requests.push({ data, config })
    if (requests.length === 1) {
      return {
        data: {
          choices: [
            {
              message: {
                content:
                  '匹配结果如下：\n{"template_id":"poster-layout-system"}\n',
              },
            },
          ],
        },
      }
    }
    return {
      data: {
        choices: [
          {
            message: {
              content:
                '最终提示词：\n{"prompt":"A finished premium launch poster","template_name":"Poster Layout System","example_case_ids":[345,5]}\n',
            },
          },
        ],
      },
    }
  }
  const signal = new AbortController().signal
  const reference = new File(['reference'], 'reference.png', {
    type: 'image/png',
  })

  const result = await polishDrawingPrompt(
    {
      prompt: '做一张新品发布海报',
      aspectRatio: '4:5',
      referenceImages: [reference],
    },
    signal
  )

  assert.equal(result, 'A finished premium launch poster')
  assert.equal(requests.length, 2)
  for (const request of requests) {
    const payload = request.data as {
      model: string
      stream: boolean
      messages: Array<{
        role: string
        content:
          | string
          | Array<{ type: string; text?: string; image_url?: { url: string } }>
      }>
    }
    assert.equal(payload.model, 'gpt-5.6-terra')
    assert.equal(payload.stream, false)
    assert.deepEqual(request.config, { signal, skipErrorHandler: true })
    const userContent = payload.messages.at(-1)?.content
    assert.ok(Array.isArray(userContent))
    assert.match(userContent[0]?.text ?? '', /做一张新品发布海报/)
    assert.match(userContent[0]?.text ?? '', /4:5/)
    assert.equal(userContent[1]?.type, 'image_url')
    assert.equal(
      userContent[1]?.image_url?.url,
      'data:image/png;base64,cmVmZXJlbmNl'
    )
  }
  assert.doesNotMatch(
    String(
      (
        requests[0].data as {
          messages: Array<{ role: string; content: string }>
        }
      ).messages[0]?.content
    ),
    /gpt-image-2-style-library|first stage/i
  )
  assert.match(
    String(
      (
        requests[0].data as {
          messages: Array<{ role: string; content: string }>
        }
      ).messages[0]?.content
    ),
    /模板类别.*视觉风格.*使用场景.*示例案例/s
  )
  assert.match(
    JSON.stringify((requests[0].data as { messages: unknown }).messages),
    /poster-layout-system/
  )
  assert.doesNotMatch(
    String(
      (
        requests[1].data as {
          messages: Array<{ role: string; content: string }>
        }
      ).messages[0]?.content
    ),
    /gpt-image-2-style-library|second stage|aspect ratio|output format/i
  )
  assert.match(
    String(
      (
        requests[1].data as {
          messages: Array<{ role: string; content: string }>
        }
      ).messages[0]?.content
    ),
    /subject and task.*composition and layout.*visual style and materials/s
  )
  assert.match(
    JSON.stringify((requests[1].data as { messages: unknown }).messages),
    /Poster Layout System/
  )
})

test('drawing prompt polishing stops when classification returns an unknown template', async () => {
  let calls = 0
  client.post = async () => {
    calls++
    return {
      data: {
        choices: [
          { message: { content: '{"template_id":"missing-template"}' } },
        ],
      },
    }
  }

  await assert.rejects(
    polishDrawingPrompt({
      prompt: 'draw a poster',
      aspectRatio: '1:1',
      referenceImages: [],
    }),
    /unknown template/i
  )
  assert.equal(calls, 1)
})

test('drawing prompt polishing rejects an empty generated prompt', async () => {
  let calls = 0
  client.post = async () => {
    calls++
    return {
      data: {
        choices: [
          {
            message: {
              content:
                calls === 1
                  ? '{"template_id":"poster-layout-system"}'
                  : '{"prompt":"   "}',
            },
          },
        ],
      },
    }
  }

  await assert.rejects(
    polishDrawingPrompt({
      prompt: 'draw a poster',
      aspectRatio: '1:1',
      referenceImages: [],
    }),
    /empty prompt/i
  )
  assert.equal(calls, 2)
})

test('drawing prompt polishing cancellation prevents the second model call', async () => {
  let calls = 0
  client.post = async (_url, _data, config) => {
    calls++
    const signal = (config as { signal: AbortSignal }).signal
    return await new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'))
      if (signal.aborted) {
        abort()
      } else {
        signal.addEventListener('abort', abort)
      }
    })
  }
  const controller = new AbortController()
  const request = polishDrawingPrompt(
    {
      prompt: 'draw a poster',
      aspectRatio: '1:1',
      referenceImages: [],
    },
    controller.signal
  )

  controller.abort()

  await assert.rejects(request, { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('drawing model discovery keeps only configured models available to the user', async () => {
  client.get = async (url, config) => {
    if (url === '/api/user/self') {
      return { data: { success: true, data: { group: 'default' } } }
    }
    assert.equal(url, '/api/user/models')
    assert.deepEqual(config, { params: { group: 'default' } })
    return {
      data: {
        success: true,
        data: ['text-only', 'nano-banana-2', 'gpt-image-2'],
      },
    }
  }

  assert.deepEqual(await getDrawingModels(), ['gpt-image-2', 'nano-banana-2'])
})

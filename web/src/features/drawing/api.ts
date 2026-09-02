import { api } from '@/lib/api'

import { splitMidjourneyGrid } from './image-grid'
import { filterDrawingModels, type DrawingRequestFormat } from './model-config'
import { DRAWING_PROMPT_TEMPLATES } from './prompt-style-data'
import { DRAWING_PROMPTS } from './prompts-data'

export interface ImageGenerationRequest {
  model: string
  prompt: string
  size?: string
  quality?: string
  n: number
  response_format: 'b64_json'
}

export interface ImageEditRequest extends ImageGenerationRequest {
  images: File[]
}

export interface ImageGenerationResponse {
  data?: Array<{ b64_json?: string; mime_type?: string; url?: string }>
}

export interface MidjourneyTaskResponse {
  id?: string
  status?: string
  progress?: string
  imageUrl?: string
  videoUrls?: Array<{ url?: string }>
  failReason?: string
}

export interface MidjourneyGenerationResult {
  taskId: string
  images: Blob[]
  usedOriginalGrid: boolean
}

type MidjourneySubmitResponse = {
  code?: number
  description?: string
  type?: string
  result?: string
}

export type MidjourneyProgressHandler = (
  progress: string,
  status: string
) => void

const MIDJOURNEY_POLL_INTERVAL_MS = 1000
const MIDJOURNEY_POLL_TIMEOUT_MS = 30 * 60 * 1000

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string }
      }>
    }
  }>
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

export interface DrawingPromptPolishInput {
  prompt: string
  aspectRatio: string
  referenceImages: File[]
  isMidjourney?: boolean
}

const DRAWING_PROMPT_POLISH_MODEL = 'gpt-5.6-terra'

const MIDJOURNEY_POLISH_TEMPLATE = `任务：
将用户提供的提示词，改写为专业的Midjourney英文提示词

可选参数：
--niji：Niji 开关
--ar：画面比例，1:1 / 16:9 / 2:3 / 9:16 等
--q：渲染质量，0.25 / 0.5 / 1 / 2
--hd：HD 高清
--style：风格：“raw”等
--s：风格化强度，0–1000
--c：混乱度，0–100
--w：怪异度，0–3000
--iw：图片权重，0–3
--cw：角色权重，0–100
--sw：风格权重，0–1000
--seed：固定种子

用户输入：
<input>`

function parseJsonResponse(content: string): Record<string, unknown> {
  const json = content.match(/\{[\s\S]*\}/)?.[0]
  if (!json) throw new Error('Invalid prompt polishing response')

  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid prompt polishing response')
  }
  return parsed as Record<string, unknown>
}

async function buildPolishUserContent(
  text: string,
  images: File[]
): Promise<
  Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
> {
  return [
    { type: 'text', text },
    ...(await Promise.all(
      images.map(async (image) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:${image.type};base64,${await fileToBase64(image)}`,
        },
      }))
    )),
  ]
}

async function requestPromptPolishStage(
  system: string,
  user: string,
  referenceImages: File[],
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const response = await api.post<ChatCompletionResponse>(
    '/v1/chat/completions',
    {
      model: DRAWING_PROMPT_POLISH_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: await buildPolishUserContent(user, referenceImages),
        },
      ],
    },
    { signal, skipErrorHandler: true }
  )
  const content = response.data.choices?.[0]?.message?.content
  if (!content) throw new Error('Prompt polishing returned an empty response')
  return parseJsonResponse(content)
}

export async function polishDrawingPrompt(
  input: DrawingPromptPolishInput,
  signal?: AbortSignal
): Promise<string> {
  if (input.isMidjourney) {
    const generated = await requestPromptPolishStage(
      'Use the supplied Midjourney prompt template to rewrite the user input as a professional Midjourney English prompt. Replace the <input> placeholder with the rewritten prompt. Preserve the template structure and include only parameters that are appropriate for the user\'s request. Return only JSON in this format: {"prompt":"final prompt"}.',
      JSON.stringify({
        original_prompt: input.prompt,
        aspect_ratio: input.aspectRatio,
        template: MIDJOURNEY_POLISH_TEMPLATE,
      }),
      input.referenceImages,
      signal
    )
    if (typeof generated.prompt !== 'string' || !generated.prompt.trim()) {
      throw new Error('Prompt polishing returned an empty prompt')
    }
    return generated.prompt.trim()
  }

  const templateIndex = DRAWING_PROMPT_TEMPLATES.map((template) => ({
    id: template.id,
    title: template.title,
    category: template.category,
    styles: template.styles,
    scenes: template.scenes,
    tags: template.tags,
    useWhen: template.useWhen,
    exampleCases: template.exampleCases,
  }))
  const classification = await requestPromptPolishStage(
    '根据用户的图片生成需求，从提供的模板列表中选择最匹配的一个模板。匹配时依次考虑模板类别、视觉风格、使用场景和示例案例。只能选择一个模板。只输出 JSON，格式为 {"template_id":"template-id"}。',
    JSON.stringify({
      original_prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      template_index: templateIndex,
    }),
    input.referenceImages,
    signal
  )
  signal?.throwIfAborted()
  const templateId = classification.template_id
  const template = DRAWING_PROMPT_TEMPLATES.find(
    (candidate) => candidate.id === templateId
  )
  if (!template) throw new Error(`Unknown template: ${String(templateId)}`)

  const exampleCaseIds = new Set(template.exampleCases.map(String))
  const examples = DRAWING_PROMPTS.filter((prompt) =>
    exampleCaseIds.has(prompt.id)
  ).map((prompt) => ({
    id: prompt.id,
    title: prompt.title,
    prompt: prompt.prompt,
  }))
  const generated = await requestPromptPolishStage(
    'Use the supplied selected template and relevant example cases to turn the user\'s image-generation intent into a production-ready image-generation prompt.\n\nBuild the final prompt with these blocks:\n- subject and task\n- composition and layout\n- visual style and materials\n- text and label requirements\n- constraints and negative details\n\nKeep constraints concrete: exact text, readable labels, layout hierarchy, and avoided artifacts.\n\nFor Chinese requests, write the final prompt in Chinese unless the user asks for English.\nFor English requests, write the final prompt in English unless the user asks for Chinese.\nWhen the user asks for multiple concepts, reuse one template and vary the subject, composition, palette, and scene.\n\nReturn only JSON in this format:\n{\n  "prompt": "final copyable prompt",\n  "template_name": "selected template name",\n  "example_case_ids": [345, 5]\n}\n\nPut the template name and example case IDs in the corresponding JSON fields. Do not put them at the beginning or end of the prompt value.',
    JSON.stringify({
      original_prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      selected_template: template,
      example_cases: examples,
    }),
    input.referenceImages,
    signal
  )
  if (typeof generated.prompt !== 'string' || !generated.prompt.trim()) {
    throw new Error('Prompt polishing returned an empty prompt')
  }
  return generated.prompt.trim()
}

async function fileToDataUrl(file: File): Promise<string> {
  return `data:${file.type};base64,${await fileToBase64(file)}`
}

export async function requestMidjourneyImage(
  prompt: string,
  referenceImages: File[],
  options: {
    signal?: AbortSignal
    onProgress?: MidjourneyProgressHandler
    pollIntervalMs?: number
  } = {}
): Promise<MidjourneyGenerationResult> {
  const base64Array = await Promise.all(
    referenceImages.map((image) => fileToDataUrl(image))
  )
  const response = await api.post<MidjourneySubmitResponse>(
    '/mj/submit/imagine',
    {
      prompt,
      ...(base64Array.length ? { base64Array } : {}),
    },
    { signal: options.signal, skipErrorHandler: true }
  )
  const taskId = response.data.result
  if (
    (response.data.code !== undefined && response.data.code !== 1) ||
    !taskId
  ) {
    throw response.data
  }

  const deadline = Date.now() + MIDJOURNEY_POLL_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? MIDJOURNEY_POLL_INTERVAL_MS
  while (Date.now() < deadline) {
    const taskResponse = await api.get<MidjourneyTaskResponse>(
      `/mj/task/${encodeURIComponent(taskId)}/fetch`,
      {
        signal: options.signal,
        skipErrorHandler: true,
        disableDuplicate: true,
      }
    )
    const task = taskResponse.data
    const status = task.status?.toUpperCase() ?? ''
    options.onProgress?.(task.progress ?? '', status)
    if (status === 'SUCCESS') {
      if (!task.imageUrl) throw task

      const individualImageIndexes = (task.videoUrls ?? []).flatMap(
        (image, index) => (image.url ? [index] : [])
      )
      if (individualImageIndexes.length > 0) {
        try {
          const responses = await Promise.all(
            individualImageIndexes.map((index) =>
              api.get<Blob>(
                `/mj/image/${encodeURIComponent(taskId)}?index=${index}`,
                {
                  signal: options.signal,
                  responseType: 'blob',
                  skipErrorHandler: true,
                  disableDuplicate: true,
                }
              )
            )
          )
          const images = responses.map((item) => item.data)
          if (images.every((image) => image.type.startsWith('image/'))) {
            return { taskId, images, usedOriginalGrid: false }
          }
        } catch (error) {
          if (options.signal?.aborted) throw error
        }
      }

      const imageResponse = await api.get<Blob>(
        `/mj/image/${encodeURIComponent(taskId)}`,
        {
          signal: options.signal,
          responseType: 'blob',
          skipErrorHandler: true,
          disableDuplicate: true,
        }
      )
      if (!imageResponse.data.type.startsWith('image/')) {
        throw new Error('Image generation failed')
      }
      try {
        const images = await splitMidjourneyGrid(imageResponse.data)
        return { taskId, images, usedOriginalGrid: false }
      } catch {
        return {
          taskId,
          images: [imageResponse.data],
          usedOriginalGrid: true,
        }
      }
    }
    if (status === 'FAILURE' || status === 'CANCELLED') {
      throw task
    }
    await waitForMidjourneyPoll(pollIntervalMs, options.signal)
  }
  throw new Error('Image generation failed')
}

function waitForMidjourneyPoll(
  delayMs: number,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
export async function requestDrawingImages(
  requestFormat: DrawingRequestFormat,
  payload: ImageGenerationRequest | ImageEditRequest,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> {
  if (requestFormat === 'gemini-generate-content') {
    const parts: Array<
      { text: string } | { inlineData: { data: string; mimeType: string } }
    > = [{ text: payload.prompt }]
    if ('images' in payload) {
      for (const image of payload.images) {
        parts.push({
          inlineData: {
            data: await fileToBase64(image),
            mimeType: image.type,
          },
        })
      }
    }

    const [aspectRatio, imageSize] = payload.size?.split(' ') ?? []
    const response = await api.post<GeminiGenerateContentResponse>(
      `/v1beta/models/${encodeURIComponent(payload.model)}:generateContent`,
      {
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            ...(aspectRatio ? { aspectRatio } : {}),
            ...(imageSize ? { imageSize: imageSize.toUpperCase() } : {}),
          },
        },
      },
      { signal, skipErrorHandler: true }
    )
    const images = (response.data.candidates ?? []).flatMap((candidate) =>
      (candidate.content?.parts ?? [])
        .filter((part) => Boolean(part.inlineData?.data))
        .map((part) => ({
          b64_json: part.inlineData?.data,
          mime_type: part.inlineData?.mimeType,
        }))
    )
    const finalImage = images.at(-1)
    return { data: finalImage ? [finalImage] : [] }
  }

  if ('images' in payload) {
    const formData = new FormData()
    formData.append('model', payload.model)
    formData.append('prompt', payload.prompt)
    if (payload.size) formData.append('size', payload.size)
    if (payload.quality) formData.append('quality', payload.quality)
    formData.append('n', String(payload.n))
    formData.append('response_format', payload.response_format)
    for (const image of payload.images) {
      formData.append('image[]', image, image.name)
    }
    const response = await api.post('/v1/images/edits', formData, {
      signal,
      skipErrorHandler: true,
    })
    return response.data
  }

  const response = await api.post('/v1/images/generations', payload, {
    signal,
    skipErrorHandler: true,
  })
  return response.data
}

export async function getDrawingModels(): Promise<string[]> {
  const selfResponse = await api.get('/api/user/self')
  const group = selfResponse.data?.data?.group
  if (!selfResponse.data?.success || typeof group !== 'string' || !group) {
    return []
  }
  const response = await api.get('/api/user/models', { params: { group } })
  return response.data?.success && Array.isArray(response.data.data)
    ? filterDrawingModels(response.data.data)
    : []
}

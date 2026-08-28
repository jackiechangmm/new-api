import { api } from '@/lib/api'

import { filterDrawingModels, type DrawingRequestFormat } from './model-config'
import {
  DRAWING_PROMPT_SKILL,
  DRAWING_PROMPT_TEMPLATES,
} from './prompt-style-data'
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
}

const DRAWING_PROMPT_POLISH_MODEL = 'gpt-5.6-terra'

function parseJsonResponse(content: string): Record<string, unknown> {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const parsed: unknown = JSON.parse(normalized)
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
    `${DRAWING_PROMPT_SKILL}\n\nFor this first stage, execute only workflow steps 1-4. Select exactly one strongest template from the supplied template index. Return only valid JSON in this shape: {"template_id":"template-id"}.`,
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
    `${DRAWING_PROMPT_SKILL}\n\nFor this second stage, continue workflow steps 5-6 using the supplied selected template and example cases. Return only valid JSON in this shape: {"prompt":"final copyable prompt"}.`,
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

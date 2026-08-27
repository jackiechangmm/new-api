import { api } from '@/lib/api'

import { filterDrawingModels, type DrawingRequestFormat } from './model-config'

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

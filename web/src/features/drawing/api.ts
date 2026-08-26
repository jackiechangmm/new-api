import { api } from '@/lib/api'

import { filterDrawingModels } from './model-config'

export interface ImageGenerationRequest {
  model: string
  group: string
  prompt: string
  size?: string
  quality?: string
  n: number
  response_format: 'b64_json'
}

export interface ImageEditRequest {
  model: string
  group: string
  prompt: string
  size?: string
  quality?: string
  n: number
  response_format: 'b64_json'
  images: File[]
}

export interface ImageGenerationResponse {
  data?: Array<{ b64_json?: string; url?: string }>
}

export async function generateImages(
  payload: ImageGenerationRequest,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> {
  const response = await api.post('/v1/images/generations', payload, {
    signal,
    skipErrorHandler: true,
  })
  return response.data
}

export async function editImages(
  payload: ImageEditRequest,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> {
  const formData = new FormData()
  formData.append('model', payload.model)
  formData.append('group', payload.group)
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

export async function getDrawingModels(group: string): Promise<string[]> {
  const response = await api.get('/api/user/models', {
    params: { group },
  })
  return response.data?.success && Array.isArray(response.data.data)
    ? filterDrawingModels(response.data.data)
    : []
}

export async function getDrawingGroups(): Promise<
  Array<{ label: string; value: string; desc: string }>
> {
  const response = await api.get('/api/user/self/groups')
  const groups = response.data?.data
  if (!response.data?.success || !groups) return []
  return Object.entries(groups).map(([value, info]) => ({
    value,
    label: value,
    desc: (info as { desc?: string }).desc ?? '',
  }))
}

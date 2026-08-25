import { api } from '@/lib/api'

export interface ImageGenerationRequest {
  model: string
  group: string
  prompt: string
  size: string
  quality: string
  n: number
  response_format: 'b64_json'
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

export async function getDrawingModels(group: string): Promise<string[]> {
  const response = await api.get('/api/user/models', {
    params: { group, endpoint: 'image-generation' },
  })
  return response.data?.success && Array.isArray(response.data.data)
    ? response.data.data
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

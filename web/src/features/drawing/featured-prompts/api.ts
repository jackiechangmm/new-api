/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { api } from '@/lib/api'

import type {
  ApiResponse,
  FeaturedPrompt,
  FeaturedPromptInput,
  FeaturedPromptPage,
} from './types'

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.message)
  return response.data
}

function toFormData(input: FeaturedPromptInput): FormData {
  const form = new FormData()
  form.set('title', input.title)
  form.set('prompt', input.prompt)
  if (input.cover) form.set('cover', input.cover)
  return form
}

export async function listFeaturedPrompts(
  page: number
): Promise<FeaturedPromptPage> {
  const response = await api.get<ApiResponse<FeaturedPromptPage>>(
    '/api/featured-prompts',
    { params: { p: page, page_size: 6 }, skipErrorHandler: true }
  )
  return unwrap(response.data)
}

export async function createFeaturedPrompt(
  input: FeaturedPromptInput
): Promise<FeaturedPrompt> {
  const response = await api.post<ApiResponse<FeaturedPrompt>>(
    '/api/featured-prompts',
    toFormData(input)
  )
  return unwrap(response.data)
}

export async function updateFeaturedPrompt(
  id: number,
  input: FeaturedPromptInput
): Promise<FeaturedPrompt> {
  const response = await api.put<ApiResponse<FeaturedPrompt>>(
    `/api/featured-prompts/${id}`,
    toFormData(input)
  )
  return unwrap(response.data)
}

export async function moveFeaturedPrompt(
  id: number,
  direction: 'up' | 'down'
): Promise<FeaturedPrompt> {
  const response = await api.post<ApiResponse<FeaturedPrompt>>(
    `/api/featured-prompts/${id}/move`,
    { direction }
  )
  return unwrap(response.data)
}

export async function deleteFeaturedPrompt(id: number): Promise<void> {
  const response = await api.delete<ApiResponse<null>>(
    `/api/featured-prompts/${id}`
  )
  unwrap(response.data)
}

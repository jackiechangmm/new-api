/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

export type FeaturedPrompt = {
  id: number
  title: string
  prompt: string
  cover_url: string
  sort_order: number
  created_at: number
  updated_at: number
}

export type FeaturedPromptPage = {
  page: number
  page_size: number
  total: number
  items: FeaturedPrompt[]
}

export type FeaturedPromptInput = {
  title: string
  prompt: string
  cover?: File
}

export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T
}

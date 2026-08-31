/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/

/**
 * Image validation utilities
 *
 * Shared validation logic for image upload features
 */

export type ImageValidationError = 'format' | 'size' | 'dimensions'

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024 // 25 MB
export const MAX_IMAGE_LONG_EDGE = 1024

export function validateImageFile(
  file: File,
  bitmap?: ImageBitmap
): ImageValidationError | undefined {
  // Validate file format
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return 'format'
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return 'size'
  }

  if (bitmap && Math.max(bitmap.width, bitmap.height) > MAX_IMAGE_LONG_EDGE) {
    return 'dimensions'
  }

  return undefined
}

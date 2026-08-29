/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 4096

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type ImageValidationError = 'format' | 'size' | 'dimensions'

export function validateImageFile(
  file: Pick<File, 'size' | 'type'>,
  dimensions?: { width: number; height: number }
): ImageValidationError | null {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) return 'format'
  if (file.size > MAX_IMAGE_BYTES) return 'size'
  if (
    dimensions &&
    (dimensions.width > MAX_IMAGE_DIMENSION ||
      dimensions.height > MAX_IMAGE_DIMENSION)
  ) {
    return 'dimensions'
  }
  return null
}

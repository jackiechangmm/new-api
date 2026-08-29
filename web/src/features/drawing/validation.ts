import type { DrawingInputConfig } from './model-config'

export const DEFAULT_REFERENCE_INPUT_CONFIG: DrawingInputConfig = {
  formats: ['image/jpeg', 'image/png', 'image/webp'],
  maxImages: 4,
  maxImageBytes: 20 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
}

export const MAX_REFERENCE_IMAGES = 4
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024
export const MAX_REFERENCE_DIMENSION = 4096
export const REFERENCE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export type ReferenceImageError =
  | 'unsupported'
  | 'too-many'
  | 'too-large'
  | 'too-wide'

export function restoreReferenceImage(blob: Blob, index: number): File {
  let extension = 'png'
  if (blob.type === 'image/jpeg') extension = 'jpg'
  if (blob.type === 'image/webp') extension = 'webp'
  return new File([blob], `reference-${index}.${extension}`, {
    type: blob.type || `image/${extension}`,
  })
}

export async function validateReferenceImages(
  files: File[],
  config?: DrawingInputConfig
): Promise<ReferenceImageError | undefined> {
  for (const [index, file] of files.entries()) {
    const error = await validateReferenceImage(
      file,
      index,
      files.slice(0, index).reduce((total, item) => total + item.size, 0),
      config
    )
    if (error) return error
  }
  return undefined
}

export async function validateReferenceImage(
  file: File,
  currentCount: number,
  currentBytes: number,
  config: DrawingInputConfig = DEFAULT_REFERENCE_INPUT_CONFIG
): Promise<ReferenceImageError | undefined> {
  if (!config.formats.includes(file.type)) return 'unsupported'
  if (config.maxImages !== undefined && currentCount >= config.maxImages) {
    return 'too-many'
  }
  if (config.maxImageBytes !== undefined && file.size > config.maxImageBytes) {
    return 'too-large'
  }
  if (
    config.maxTotalBytes !== undefined &&
    currentBytes + file.size > config.maxTotalBytes
  ) {
    return 'too-large'
  }

  const url = URL.createObjectURL(file)
  try {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image()
        image.addEventListener('load', () =>
          resolve({ width: image.width, height: image.height })
        )
        image.addEventListener('error', () =>
          reject(new Error('Invalid image'))
        )
        image.src = url
      }
    )
    if (
      dimensions.width > (config.maxWidth ?? Number.POSITIVE_INFINITY) ||
      dimensions.height > (config.maxHeight ?? Number.POSITIVE_INFINITY)
    ) {
      return 'too-wide'
    }
  } catch {
    return 'unsupported'
  } finally {
    URL.revokeObjectURL(url)
  }
  return undefined
}

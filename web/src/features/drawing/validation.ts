import type { DrawingInputConfig } from './model-config'

export const DEFAULT_REFERENCE_INPUT_CONFIG: DrawingInputConfig = {
  formats: ['image/jpeg', 'image/png', 'image/webp'],
  maxImages: 4,
  maxImageBytes: 20 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
}

export const MAX_REFERENCE_IMAGES = DEFAULT_REFERENCE_INPUT_CONFIG.maxImages
export const MAX_REFERENCE_BYTES = DEFAULT_REFERENCE_INPUT_CONFIG.maxTotalBytes
export const MAX_REFERENCE_DIMENSION = DEFAULT_REFERENCE_INPUT_CONFIG.maxWidth
export const REFERENCE_IMAGE_TYPES = new Set(
  DEFAULT_REFERENCE_INPUT_CONFIG.formats
)

export type ReferenceImageError =
  | 'unsupported'
  | 'too-many'
  | 'too-large'
  | 'too-wide'

export async function validateReferenceImage(
  file: File,
  currentCount: number,
  currentBytes: number,
  config: DrawingInputConfig = DEFAULT_REFERENCE_INPUT_CONFIG
): Promise<ReferenceImageError | undefined> {
  if (!config.formats.includes(file.type)) return 'unsupported'
  if (currentCount >= config.maxImages) return 'too-many'
  if (file.size > config.maxImageBytes) return 'too-large'
  if (currentBytes + file.size > config.maxTotalBytes) return 'too-large'

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
      dimensions.width > config.maxWidth ||
      dimensions.height > config.maxHeight
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

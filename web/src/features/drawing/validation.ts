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

export async function validateReferenceImage(
  file: File,
  currentCount: number,
  currentBytes: number
): Promise<ReferenceImageError | undefined> {
  if (!REFERENCE_IMAGE_TYPES.has(file.type)) return 'unsupported'
  if (currentCount >= MAX_REFERENCE_IMAGES) return 'too-many'
  if (currentBytes + file.size > MAX_REFERENCE_BYTES) return 'too-large'

  const url = URL.createObjectURL(file)
  try {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image()
        image.onload = () =>
          resolve({ width: image.width, height: image.height })
        image.onerror = () => reject(new Error('Invalid image'))
        image.src = url
      }
    )
    if (
      dimensions.width > MAX_REFERENCE_DIMENSION ||
      dimensions.height > MAX_REFERENCE_DIMENSION
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

export function compressImageToWebP(file: File, quality = 0.85): Promise<File> {
  // 仅在不强调图像质量的时候使用此种压缩
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectURL = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectURL)
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Unable to create image canvas'))
        return
      }
      context.drawImage(image, 0, 0)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Unable to compress image'))
            return
          }
          resolve(
            new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, {
              type: 'image/webp',
              lastModified: file.lastModified,
            })
          )
        },
        'image/webp',
        quality
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectURL)
      reject(new Error('Unable to load image'))
    }
    image.src = objectURL
  })
}

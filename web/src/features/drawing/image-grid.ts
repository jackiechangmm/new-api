export async function splitMidjourneyGrid(image: Blob): Promise<Blob[]> {
  const source = await createImageBitmap(image)
  try {
    const tileWidth = Math.floor(source.width / 2)
    const tileHeight = Math.floor(source.height / 2)
    if (tileWidth < 1 || tileHeight < 1) {
      throw new Error('Invalid Midjourney grid dimensions')
    }

    return await Promise.all(
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([column, row]) => {
        const canvas = document.createElement('canvas')
        canvas.width = tileWidth
        canvas.height = tileHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas is unavailable')
        context.drawImage(
          source,
          column * tileWidth,
          row * tileHeight,
          tileWidth,
          tileHeight,
          0,
          0,
          tileWidth,
          tileHeight
        )
        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Midjourney grid split failed'))
            }
          }, 'image/png')
        })
      })
    )
  } finally {
    source.close()
  }
}

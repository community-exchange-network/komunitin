const MAX_IMAGE_LONG_SIDE = 1800
const WEBP_QUALITY = 0.82
const DEFAULT_IMAGE_NAME = 'image'

interface DecodedImage {
  cleanup: () => void,
  source: ImageBitmap,
  height: number,
  width: number
}

const resizeDimensions = (width: number, height: number) => {
  if (width <= 0 || height <= 0) {
    throw new Error('Could not read image dimensions')
  }

  const ratio = Math.min(1, MAX_IMAGE_LONG_SIDE / Math.max(width, height))

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  }
}

const webpFilename = (name: string) => {
  const baseName = name.replace(/\.[^.]+$/, '')
  return `${baseName || DEFAULT_IMAGE_NAME}.webp`
}

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const toWebpBlob = async (canvas: HTMLCanvasElement) => {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Could not encode image'))
      }
    }, 'image/webp', WEBP_QUALITY)
  })
}

// We intentionally rely on the modern image-decoding path here instead of
// keeping legacy fallbacks. If a browser cannot decode/resize uploads with the
// baseline APIs we support, the caller can surface a friendly upload error.
const decodeImage = async (file: File): Promise<DecodedImage> => {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser does not support image processing for uploads')
  }

  const bitmap = await createImageBitmap(file)

  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    cleanup: () => bitmap.close()
  }
}

export const transformImageFile = async (file: File) => {
  const decoded = await decodeImage(file)

  try {
    const { width, height } = resizeDimensions(decoded.width, decoded.height)
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Could not create image canvas')
    }

    context.drawImage(decoded.source, 0, 0, width, height)

    return new File([await toWebpBlob(canvas)], webpFilename(file.name), {
      type: 'image/webp',
      lastModified: file.lastModified
    })
  } finally {
    decoded.cleanup()
  }
}

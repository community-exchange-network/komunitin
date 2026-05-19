const MAX_IMAGE_LONG_SIDE = 1800
const WEBP_QUALITY = 0.82
const DEFAULT_IMAGE_NAME = 'image'

interface DecodedImage {
  cleanup: () => void,
  source: CanvasImageSource,
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

const webpFilename = (name: string) => `${name.replace(/\.[^.]+$/, '') || DEFAULT_IMAGE_NAME}.webp`

const createCanvas = (width: number, height: number) => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const toWebpBlob = async (canvas: OffscreenCanvas | HTMLCanvasElement) => {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY })
  }

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

const decodeWithImageBitmap = async (file: File): Promise<DecodedImage> => {
  const bitmap = await createImageBitmap(file)

  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    cleanup: () => bitmap.close()
  }
}

const decodeWithImageElement = async (file: File): Promise<DecodedImage> => {
  const objectUrl = window.URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not decode image'))
      img.src = objectUrl
    })

    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      source: image,
      cleanup: () => window.URL.revokeObjectURL(objectUrl)
    }
  } catch (error) {
    window.URL.revokeObjectURL(objectUrl)
    throw error
  }
}

const decodeImage = async (file: File) => {
  if (typeof createImageBitmap !== 'function') {
    return decodeWithImageElement(file)
  }

  try {
    return await decodeWithImageBitmap(file)
  } catch {
    return decodeWithImageElement(file)
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

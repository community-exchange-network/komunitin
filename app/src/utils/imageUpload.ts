export const IMAGE_UPLOAD_MAX_SIDE = 1800

export const IMAGE_UPLOAD_WEBP_TYPE = "image/webp"
export const IMAGE_UPLOAD_WEBP_QUALITY = 0.82

export const IMAGE_UPLOAD_JPEG_TYPE = "image/jpeg"
export const IMAGE_UPLOAD_JPEG_QUALITY = 0.82


export interface ImageUploadOptions {
  maxSide?: number
  quality?: number
}

interface ImageDimensions {
  width: number
  height: number
}

interface DecodedImage extends ImageDimensions {
  source: CanvasImageSource
  close: () => void
}

export function getResizedImageDimensions(
  width: number,
  height: number,
  maxSide = IMAGE_UPLOAD_MAX_SIDE
): ImageDimensions {
  const longestSide = Math.max(width, height)

  if (longestSide <= maxSide) {
    return { width, height }
  }

  const scale = maxSide / longestSide
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

export function getUploadImageFileName(fileName: string, type: string): string {
  const baseName = fileName.replace(/\.[^/.]+$/, "")
  const extension = type === IMAGE_UPLOAD_WEBP_TYPE ? "webp" : "jpg"
  return `${baseName || "image"}.${extension}`
}

export async function resizeImageToWebp(
  file: File,
  options: ImageUploadOptions = {}
): Promise<File> {
  if (!file.type.toUpperCase().startsWith("IMAGE/")) {
    throw new Error("Only image files can be resized")
  }

  const decodedImage = await decodeImage(file)

  try {
    const { width, height } = getResizedImageDimensions(
      decodedImage.width,
      decodedImage.height,
      options.maxSide
    )
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")
    if (context === null) {
      throw new Error("Could not create an image canvas")
    }

    context.drawImage(decodedImage.source, 0, 0, width, height)

    let blob = await canvasToBlob(
      canvas,
      IMAGE_UPLOAD_WEBP_TYPE,
      options.quality ?? IMAGE_UPLOAD_WEBP_QUALITY
    )
    
    if (blob.type !== IMAGE_UPLOAD_WEBP_TYPE) {
      // Fallback for browsers that don't support WebP encoding.
      blob = await canvasToBlob(canvas, IMAGE_UPLOAD_JPEG_TYPE, options.quality ?? IMAGE_UPLOAD_JPEG_QUALITY)
    }

    return new File([blob], getUploadImageFileName(file.name, blob.type), {
      type: blob.type,
      lastModified: file.lastModified
    })
  } finally {
    decodedImage.close()
  }
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      }
    } catch {
      // Fall through to HTMLImageElement decoding below.
    }
  }

  return decodeImageElement(file)
}

async function decodeImageElement(file: File): Promise<DecodedImage> {
  const src = URL.createObjectURL(file)
  const image = new Image()

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("Could not decode image"))
      image.src = src
    })
  } catch (error) {
    URL.revokeObjectURL(src)
    throw error
  }

  return {
    source: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    close: () => URL.revokeObjectURL(src)
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("Could not encode image"))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

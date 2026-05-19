import { computed, ref } from 'vue'
import { config } from 'src/utils/config'
import { useStore } from 'vuex'
import type { QUploader } from 'quasar'

const MAX_IMAGE_LONG_SIDE = 1800
const WEBP_QUALITY = 0.82

type UploadStatus = 'idle' | 'failed' | 'uploading' | 'uploaded'

export interface UploadedImageFile {
  name: string,
  __key: string,
  __sizeLabel: string,
  __progressLabel: string,
  __progress: number,
  __status: UploadStatus,
  __img: {
    src: string
  }
}

export interface UploadManagedFile extends File {
  __abort?: () => void,
  __img?: HTMLImageElement,
  __key: string,
  __processed?: boolean,
  __progress: number,
  __progressLabel: string,
  __sizeLabel: string,
  __status: UploadStatus,
  __uploaded: number,
  xhr?: XMLHttpRequest
}

/**
 * Normalized decoded image data used during client-side image processing.
 * It exposes a canvas-compatible source plus a cleanup hook for any temporary
 * browser resources created while decoding the original file.
 */
interface DecodedImage {
  cleanup: () => void,
  source: CanvasImageSource,
  height: number,
  width: number
}

interface UploaderSettings {
  fieldName: string,
  headers: () => { name: string, value: string }[],
  url: string
}

/**
 * Some configuration to use with QUploader component to send files to the
 * backend (currently Drupal).
 */
export const useUploaderSettings = (): UploaderSettings => {
  const store = useStore()
  const fieldName = 'files[file]'
  const url = config.FILES_URL

  const headers = () => {
    const token = store.getters.accessToken
    return [{ name: 'Authorization', value: `Bearer ${token}` }]
  }

  return { fieldName, url, headers }
}

const getImageDimensions = (width: number, height: number) => {
  if (width <= 0 || height <= 0) {
    throw new Error('Could not read image dimensions')
  }

  const longerSide = Math.max(width, height)
  if (longerSide <= MAX_IMAGE_LONG_SIDE) {
    return { width, height }
  }

  const ratio = MAX_IMAGE_LONG_SIDE / longerSide
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  }
}

const getImageFilename = (name: string) => {
  const basename = name.replace(/\.[^.]+$/, '') || 'image'
  return `${basename}.webp`
}

const createCanvas = (width: number, height: number) => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const canvasToBlob = async (canvas: OffscreenCanvas | HTMLCanvasElement) => {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY })
  }

  return await new Promise<Blob>((resolve, reject) => {
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
  if (typeof createImageBitmap === 'function') {
    try {
      return await decodeWithImageBitmap(file)
    } catch {
      return decodeWithImageElement(file)
    }
  }

  return decodeWithImageElement(file)
}

export const transformImageFile = async (file: File) => {
  const decodedImage = await decodeImage(file)

  try {
    const { width, height } = getImageDimensions(decodedImage.width, decodedImage.height)
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Could not create image canvas')
    }

    context.drawImage(decodedImage.source, 0, 0, width, height)

    const blob = await canvasToBlob(canvas)
    return new File([blob], getImageFilename(file.name), {
      type: 'image/webp',
      lastModified: file.lastModified
    })
  } finally {
    decodedImage.cleanup()
  }
}

const parseUploadedUrl = (xhr: XMLHttpRequest) => {
  const response = JSON.parse(xhr.responseText)
  return response.data.attributes.url as string
}

const toManagedFile = (file: File) => {
  const managedFile = file as UploadManagedFile
  managedFile.__processed = true
  return managedFile
}

const isManagedFile = (file: File): file is UploadManagedFile => {
  return (file as UploadManagedFile).__processed === true
}

export const useImageUploader = (onUploaded: (url: string) => void) => {
  const uploader = ref<QUploader>()
  const uploaderFiles = computed(() => (uploader.value?.files || []) as UploadManagedFile[])
  const processingKeys = ref<string[]>([])

  const { url, headers, fieldName } = useUploaderSettings()

  const isProcessing = computed(() => processingKeys.value.length > 0)
  const isUploading = computed(() => uploaderFiles.value.some(file => file.__status === 'uploading'))
  const isWorking = computed(() => isProcessing.value || isUploading.value)

  const setProcessing = (key: string, active: boolean) => {
    processingKeys.value = active
      ? [...processingKeys.value, key]
      : processingKeys.value.filter(currentKey => currentKey !== key)
  }

  const removeQueuedFile = (file: UploadManagedFile) => {
    const queuedFiles = (uploader.value as QUploader & { queuedFiles?: UploadManagedFile[] } | undefined)?.queuedFiles
    const index = queuedFiles?.findIndex(queuedFile => queuedFile.__key === file.__key) ?? -1

    if (queuedFiles && index !== -1) {
      queuedFiles.splice(index, 1)
    }
  }

  const uploadFile = (file: UploadManagedFile) => {
    const currentUploader = uploader.value
    if (!currentUploader || file.__status === 'uploading' || file.__status === 'uploaded') {
      return
    }

    const form = new FormData()
    const xhr = new XMLHttpRequest()

    file.xhr = xhr
    file.__abort = () => xhr.abort()

    xhr.upload.addEventListener('progress', event => {
      if (!uploader.value) {
        return
      }

      uploader.value.updateFileStatus(file, 'uploading', Math.min(event.loaded, file.size))
    })

    xhr.addEventListener('load', () => {
      if (!uploader.value) {
        return
      }

      if (xhr.status >= 200 && xhr.status < 400) {
        uploader.value.updateFileStatus(file, 'uploaded')
        onUploaded(parseUploadedUrl(xhr))
        uploader.value.removeUploadedFiles()
      } else {
        uploader.value.updateFileStatus(file, 'failed')
      }
    })

    xhr.addEventListener('error', () => {
      uploader.value?.updateFileStatus(file, 'failed')
    })

    xhr.addEventListener('abort', () => {
      uploader.value?.removeFile(file)
    })

    xhr.open('POST', url)
    headers().forEach(header => {
      xhr.setRequestHeader(header.name, header.value)
    })

    form.append(fieldName, file, file.name)
    removeQueuedFile(file)
    uploader.value.updateFileStatus(file, 'uploading', 0)
    xhr.send(form)
  }

  const addFiles = async (files: readonly File[]) => {
    const currentUploader = uploader.value
    if (!currentUploader) {
      return
    }

    const managedFiles = files.filter(isManagedFile)
    if (managedFiles.length > 0) {
      managedFiles.forEach(uploadFile)
      return
    }

    const transformedFiles: UploadManagedFile[] = []

    for (const file of files as UploadManagedFile[]) {
      const processingKey = file.__key || `${file.name}-${file.lastModified}`
      setProcessing(processingKey, true)

      try {
        const transformedFile = toManagedFile(await transformImageFile(file))

        const isStillQueued = uploaderFiles.value.some(queuedFile => queuedFile.__key === file.__key)
        if (!isStillQueued) {
          continue
        }

        currentUploader.removeFile(file)
        transformedFiles.push(transformedFile)
      } catch {
        removeQueuedFile(file)
        currentUploader.updateFileStatus(file, 'failed')
      } finally {
        setProcessing(processingKey, false)
      }
    }

    if (transformedFiles.length > 0) {
      currentUploader.addFiles(transformedFiles)
    }
  }

  const abortUploads = () => {
    uploaderFiles.value
      .filter(file => file.__status === 'uploading')
      .forEach(file => uploader.value?.removeFile(file))
  }

  return {
    abortUploads,
    addFiles,
    isProcessing,
    isUploading,
    isWorking,
    uploader,
    uploaderFiles
  }
}

/**
 * Create an image file object for QUploader component.
 * @param imageUrl URL of the image
 */
export const imageFile = (imageUrl: string) => {
  return {
    name: imageUrl.split('/').pop() || imageUrl,
    __key: imageUrl,
    __sizeLabel: '',
    __progressLabel: '',
    __progress: 1,
    __status: 'uploaded',
    __img: {
      src: imageUrl
    }
  } as UploadedImageFile
}

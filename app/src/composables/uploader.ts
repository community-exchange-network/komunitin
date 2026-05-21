import { computed, ref } from 'vue'
import type { QUploader } from 'quasar'
import { config } from 'src/utils/config'
import { useStore } from 'vuex'
import { transformImageFile } from './image-transform'

type UploadStatus = 'idle' | 'failed' | 'uploading' | 'uploaded'

// UI model for an image that already exists remotely. It is shown in the same
// list as in-flight uploads, but it is not a local File and it has no upload
// lifecycle attached to it anymore.
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

// QUploader augments picked File instances with its own bookkeeping fields.
// We keep using that runtime shape after transforming the original image so the
// component can still render previews, progress and abort state for each file.
export interface UploadManagedFile extends File {
  __abort?: () => void,
  __img?: HTMLImageElement,
  __key: string,
  __processed?: true,
  __progress: number,
  __progressLabel: string,
  __sizeLabel: string,
  __status: UploadStatus,
  __uploaded: number,
  xhr?: XMLHttpRequest
}

type UploadHeader = { name: string, value: string }
type UploadCallback = (url: string) => void
type UploadedFileResponse = {
  data: {
    attributes: {
      url: string
    }
  }
}

// Minimal QUploader shape that this composable relies on, including the
// private queuedFiles array that Quasar uses for files picked but not sent yet.
type QUploaderWithQueue = QUploader & { queuedFiles?: UploadManagedFile[] }

const FIELD_NAME = 'files[file]'
const isManagedFile = (file: File): file is UploadManagedFile => Boolean((file as UploadManagedFile).__processed)
const toManagedFile = (file: File) => Object.assign(file, { __processed: true as const }) as UploadManagedFile
const uploadedUrl = (xhr: XMLHttpRequest) => {
  const response = JSON.parse(xhr.responseText) as UploadedFileResponse
  return response.data.attributes.url
}

const imageHeaders = (token: string): UploadHeader[] => [{ name: 'Authorization', value: `Bearer ${token}` }]

const useUploaderSettings = () => {
  const store = useStore()

  return {
    fieldName: FIELD_NAME,
    url: config.FILES_URL,
    headers: () => imageHeaders(store.getters.accessToken)
  }
}

const removeQueuedFile = (uploader: QUploaderWithQueue | undefined, file: UploadManagedFile) => {
  // After we transform a picked file, QUploader still keeps the original File in
  // its private pending queue. Removing that stale entry is what lets us replace
  // the original with the transformed file instead of uploading both versions.
  const index = uploader?.queuedFiles?.findIndex(queuedFile => queuedFile.__key === file.__key) ?? -1

  if (index !== -1) {
    uploader?.queuedFiles?.splice(index, 1)
  }
}

const sendFile = ({
  file,
  headers,
  onUploaded,
  uploader,
  url
}: {
  file: UploadManagedFile,
  headers: UploadHeader[],
  onUploaded: UploadCallback,
  uploader: QUploaderWithQueue,
  url: string
}) => {
  const form = new FormData()
  const xhr = new XMLHttpRequest()

  file.xhr = xhr
  file.__abort = () => xhr.abort()

  xhr.upload.addEventListener('progress', event => {
    uploader.updateFileStatus(file, 'uploading', Math.min(event.loaded, file.size))
  })

  xhr.addEventListener('load', () => {
    if (xhr.status >= 200 && xhr.status < 400) {
      uploader.updateFileStatus(file, 'uploaded')
      onUploaded(uploadedUrl(xhr))
      uploader.removeUploadedFiles()
      return
    }

    uploader.updateFileStatus(file, 'failed')
  })

  xhr.addEventListener('error', () => {
    uploader.updateFileStatus(file, 'failed')
  })

  xhr.addEventListener('abort', () => {
    uploader.removeFile(file)
  })

  // XHR is kept here because QUploader needs per-file upload progress and abort
  // hooks; fetch still does not provide simple upload progress events.
  xhr.open('POST', url)
  headers.forEach(header => {
    xhr.setRequestHeader(header.name, header.value)
  })

  form.append(FIELD_NAME, file, file.name)
  removeQueuedFile(uploader, file)
  uploader.updateFileStatus(file, 'uploading', 0)
  xhr.send(form)
}

// The composable reports uploads one file at a time because the UI wants each
// completed image URL as soon as it is available. `addFiles` is still async for
// the preprocessing step, but returning a single Promise for all uploads would
// either delay those updates or complicate per-file progress/abort handling.
export const useImageUploader = (onUploaded: UploadCallback) => {
  const uploader = ref<QUploaderWithQueue>()
  const pendingTransforms = ref(0)
  const { headers, url } = useUploaderSettings()

  const uploaderFiles = computed(() => uploader.value?.files as UploadManagedFile[] || [])
  const isProcessing = computed(() => pendingTransforms.value > 0)
  const isUploading = computed(() => uploaderFiles.value.some(file => file.__status === 'uploading'))
  const isWorking = computed(() => isProcessing.value || isUploading.value)

  const uploadProcessedFile = (file: UploadManagedFile) => {
    if (!uploader.value || file.__status === 'uploading' || file.__status === 'uploaded') {
      return
    }

    sendFile({
      file,
      headers: headers(),
      onUploaded,
      uploader: uploader.value,
      url
    })
  }

  const processPickedFile = async (file: UploadManagedFile) => {
    pendingTransforms.value++

    try {
      const transformedFile = toManagedFile(await transformImageFile(file))

      if (!uploaderFiles.value.some(queuedFile => queuedFile.__key === file.__key)) {
        return null
      }

      uploader.value?.removeFile(file)
      return transformedFile
    } catch {
      removeQueuedFile(uploader.value, file)
      uploader.value?.updateFileStatus(file, 'failed')
      return null
    } finally {
      pendingTransforms.value--
    }
  }

  const addFiles = async (files: readonly File[]) => {
    if (!uploader.value) {
      return
    }

    const processedFiles = files.filter(isManagedFile)
    if (processedFiles.length > 0) {
      processedFiles.forEach(uploadProcessedFile)
      return
    }

    const transformedFiles = (await Promise.all(
      (files as UploadManagedFile[]).map(processPickedFile)
    )).filter((file): file is UploadManagedFile => file !== null)

    if (transformedFiles.length > 0) {
      // Re-adding transformed files lets QUploader keep its preview/list UI.
      uploader.value.addFiles(transformedFiles)
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

export const imageFile = (imageUrl: string): UploadedImageFile => ({
  name: imageUrl.split('/').pop() || imageUrl,
  __key: imageUrl,
  __sizeLabel: '',
  __progressLabel: '',
  __progress: 1,
  __status: 'uploaded',
  __img: {
    src: imageUrl
  }
})

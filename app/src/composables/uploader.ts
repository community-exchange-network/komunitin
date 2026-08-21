import { Notify, type QUploader } from "quasar"
import { computed, shallowRef, toValue, type MaybeRefOrGetter, type Ref } from "vue"
import { useStore } from "vuex"
import { config } from "src/utils/config"
import { resizeImageToWebp } from "src/utils/imageUpload"
import { i18n } from "src/boot/i18n"
import type { ImageObject } from "src/store/model"

type FileResourceType = "members" | "groups" | "offers" | "needs"

/**
 * Build the tenant-aware configuration expected by QUploader.
 */
const useUploaderSettings = ({
  code,
  resourceType
}: {
  code: MaybeRefOrGetter<string>,
  resourceType: FileResourceType
}) => {
  const store = useStore()
  const fieldName = "file"
  const url = computed(() => `${config.FILES_URL}/${toValue(code)}/files/upload`)
  const formFields = [{ name: "resourceType", value: resourceType }]

  const headers = computed(() => {
    const token = store.getters.accessToken
    return [{name : 'Authorization', value: `Bearer ${token}`}]
  })

  return { fieldName, url, headers, formFields }
}
/**
 * A type for the image file object for QUploader component.
 */
export interface ImageFile {
  name: string,
  __key: string,
  __sizeLabel: string,
  __progressLabel: string,
  __progress: number,
  __status: string,
  __img: {
    src: string
  }
}
/**
 * Create an image file object for QUploader component.
 * @param url URL of the image
 */
export const imageFile = (url: string) => {
  const filename = (url: string) => url.split("/").pop() ?? ""
  return {
    name: filename(url),
    __key: url,
    __sizeLabel: "",
    __progressLabel: "",
    __progress: 1,
    __status: "uploaded",
    __img: {
      src: url
    } 
  } as ImageFile
}

interface UseImageUploaderProcessingOptions {
  uploader: Readonly<Ref<QUploader | null | undefined>>
  transformFile?: (file: File) => Promise<File>
  notifyError?: () => void
  deferred?: boolean
}

const useImageUploaderProcessing = ({
  uploader,
  transformFile = resizeImageToWebp,
  notifyError = notifyImageError,
  deferred = false
}: UseImageUploaderProcessingOptions) => {
  const processedFiles = new WeakSet<File>()
  const processingCount = shallowRef(0)
  const isProcessing = computed(() => processingCount.value > 0)

  const process = async (files: readonly File[]) => {
    const filesToProcess = files.filter(file => !processedFiles.has(file))
    if (filesToProcess.length === 0) {
      return
    }

    const activeUploader = uploader.value
    if (activeUploader === null || activeUploader === undefined) {
      return
    }

    processingCount.value++

    try {
      const results = await Promise.allSettled(filesToProcess.map(file => transformFile(file)))
      const convertedFiles = results.flatMap(result => {
        if (result.status === "fulfilled") {
          processedFiles.add(result.value)
          return [result.value]
        }
        return []
      })

      if (results.some(result => result.status === "rejected")) {
        notifyError()
      }

      if (activeUploader.isAlive() === false) {
        return
      }

      filesToProcess.forEach(file => activeUploader.removeFile(file))

      if (convertedFiles.length === 0) {
        return
      }

      activeUploader.addFiles(convertedFiles)
      if (!deferred) {
        activeUploader.upload()
      }
    } finally {
      processingCount.value--
    }
  }

  return { isProcessing, process }
}

function notifyImageError() {
  Notify.create({
    type: "negative",
    message: i18n.global.t("imageUploadError").toString()
  })
}

export interface UseImageUploaderOptions {
  uploader: Readonly<Ref<QUploader | null>>
  code: MaybeRefOrGetter<string>
  resourceType: FileResourceType
  deferred?: boolean
  onUploaded: (image: ImageObject) => void
}

/**
 * Adapt QUploader's event-based API into the image uploader interface used by
 * application components.
 */
export const useImageUploader = ({
  uploader,
  code,
  resourceType,
  deferred = false,
  onUploaded
}: UseImageUploaderOptions) => {
  const settings = useUploaderSettings({ code, resourceType })
  const { isProcessing, process } = useImageUploaderProcessing({
    uploader,
    deferred
  })

  let processing = Promise.resolve()
  let resolveUpload: ((successful: boolean) => void) | undefined
  let uploadFailed = false

  const added = (files: readonly File[]) => {
    processing = process(files)
    return processing
  }

  const uploaded = ({xhr}: {xhr: XMLHttpRequest}) => {
    const response = JSON.parse(xhr.responseText)
    const image = { url: response.data.attributes.url }
    onUploaded(image)
    uploader.value?.removeUploadedFiles()
  }

  const failed = ({files}: {files: readonly File[]}) => {
    files.forEach(file => uploader.value?.removeFile(file))
    uploadFailed = true
    notifyImageError()
  }

  const finish = () => {
    resolveUpload?.(!uploadFailed)
    resolveUpload = undefined
  }

  /** 
   * Upload all queued files and resolve when the whole batch finishes. 
   * Return true if all files were uploaded successfully, false otherwise.
   * */
  const upload = async (): Promise<boolean> => {
    await processing
    const activeUploader = uploader.value

    if (activeUploader.queuedFiles.length === 0) {
      return true
    }

    uploadFailed = false
    return new Promise<boolean>(resolve => {
      resolveUpload = resolve
      activeUploader?.upload()
    })
  }

  const uploaderProps = computed(() => ({
    fieldName: settings.fieldName,
    url: settings.url.value,
    headers: settings.headers.value,
    formFields: settings.formFields
  }))

  const uploaderEvents = {
    added,
    uploaded,
    failed,
    finish
  }

  return {
    uploaderProps,
    uploaderEvents,
    isProcessing,
    upload
  }
}

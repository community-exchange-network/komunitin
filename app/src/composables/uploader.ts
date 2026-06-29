import { Notify, type QUploader } from "quasar"
import { computed, shallowRef, type Ref } from "vue"
import { useStore } from "vuex"
import { config } from "src/utils/config"
import { resizeImageToWebp } from "src/utils/imageUpload"
import { i18n } from "src/boot/i18n"

/**
 * Some configuration to use with QUploader component to send files to the
 * backend (currently Drupal).
 */
export const useUploaderSettings = () => {
  const store = useStore()
  // I'd prefer just "file" but Drupal backend requires it to be file[something],
  // and the aesthetics of a good name does not pay for the work today ;)
  const fieldName = "files[file]"
  const url = config.FILES_URL

  const headers = computed(() => {
    const token = store.getters.accessToken
    return [{name : 'Authorization', value: `Bearer ${token}`}]
  })

  return { fieldName, url, headers }
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

export interface UseImageUploaderProcessingOptions {
  uploader: Readonly<Ref<QUploader | null | undefined>>
  transformFile?: (file: File) => Promise<File>
  notifyError?: () => void
}

export const useImageUploaderProcessing = ({
  uploader,
  transformFile = resizeImageToWebp,
  notifyError = notifyImageProcessingError
}: UseImageUploaderProcessingOptions) => {
  const processedFiles = new WeakSet<File>()
  const processingCount = shallowRef(0)
  const isProcessing = computed(() => processingCount.value > 0)

  const handleAdded = async (files: readonly File[]) => {
    const filesToProcess = files.filter(file => !processedFiles.has(file))
    if (filesToProcess.length === 0) {
      return
    }

    const activeUploader = uploader.value
    if (activeUploader === null || activeUploader === undefined) {
      return
    }

    filesToProcess.forEach(file => activeUploader.removeFile(file))
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

      if (convertedFiles.length === 0 || uploader.value?.isAlive() === false) {
        return
      }

      uploader.value?.addFiles(convertedFiles)
      uploader.value?.upload()
    } finally {
      processingCount.value--
    }
  }

  return { isProcessing, handleAdded }
}

function notifyImageProcessingError() {
  Notify.create({
    type: "negative",
    message: i18n.global.t("imageProcessingError").toString()
  })
}

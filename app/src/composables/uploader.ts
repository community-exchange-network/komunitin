import { KOptions } from "../boot/koptions"
import { useStore } from "vuex"

/**
 * Some configuration to use with QUploader component to send files to the
 * backend (currently Drupal).
 */
export const useUploaderSettings = () => {
  const store = useStore()
  // I'd prefer just "file" but Drupal backend requires it to be file[something],
  // and the aesthetics of a good name does not pay for the work today ;)
  const fieldName = "files[file]"
  const url = KOptions.url.files

  const headers = () => {
    const token = store.getters.accessToken
    return [{name : 'Authorization', value: `Bearer ${token}`}]
  }

  return { fieldName, url, headers }
}
/**
 * A type for the image file object for QUploader component.
 */
export interface ImageFile {
  name: string,
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
  const filename = (url: string) => url.split("/").pop()
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
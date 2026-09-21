import KError, { KErrorCode } from "@/KError"

const checkNfcAvailable = () => {
  try {
    if (!("NDEFReader" in window)) {
      return false
    }
    new NDEFReader()
    return true
  } catch {
    return false
  }
}

export const isNfcAvailable = checkNfcAvailable()

export const scan = (ctrl: AbortController) => new Promise<{serialNumber: string}>((resolve, reject) => {
  if (!isNfcAvailable) {
    reject(new KError(KErrorCode.NFCUnavailable, 'NFC not available'))
    return
  }
  try {
    const ndef = new NDEFReader()
    ndef.addEventListener("reading", (event) => {
      resolve(event as NDEFReadingEvent)
    }, {once: true})
    ndef.addEventListener("readingerror", (error) => {
      reject(error)
    }, {once: true})
    
    ndef.scan({
      signal: ctrl.signal
    }).catch((err: Error) => reject(err))
  } catch (error) {
    reject(error)
  }
})
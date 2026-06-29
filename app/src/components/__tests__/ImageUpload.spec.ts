import { shallowRef } from "vue"
import type { QUploader } from "quasar"
import {
  IMAGE_UPLOAD_WEBP_QUALITY,
  IMAGE_UPLOAD_WEBP_TYPE,
  getResizedImageDimensions,
  getWebpFileName,
  resizeImageToWebp
} from "src/utils/imageUpload"
import { useImageUploaderProcessing } from "src/composables/uploader"

interface MockImageBitmap {
  width: number
  height: number
  close: ReturnType<typeof vi.fn>
}

const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext")
const originalToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob")

let drawImage: ReturnType<typeof vi.fn>
let toBlobResult: Blob | null
let toBlobMimeType: string | undefined
let toBlobQuality: number | undefined

function installCanvasMocks() {
  drawImage = vi.fn()
  toBlobResult = new Blob(["webp"], { type: IMAGE_UPLOAD_WEBP_TYPE })
  toBlobMimeType = undefined
  toBlobQuality = undefined

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => ({ drawImage }))
  })

  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
      toBlobMimeType = type
      toBlobQuality = quality
      callback(toBlobResult)
    })
  })
}

function restoreCanvasMocks() {
  if (originalGetContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext)
  } else {
    delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).getContext
  }

  if (originalToBlob) {
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", originalToBlob)
  } else {
    delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).toBlob
  }
}

function stubDecodedImage(width: number, height: number) {
  const bitmap: MockImageBitmap = {
    width,
    height,
    close: vi.fn()
  }
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap as unknown as ImageBitmap))
  return bitmap
}

describe("image upload utilities", () => {
  beforeEach(() => {
    installCanvasMocks()
  })

  afterEach(() => {
    restoreCanvasMocks()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("computes resized dimensions with a max longer side", () => {
    expect(getResizedImageDimensions(3600, 2400)).toEqual({ width: 1800, height: 1200 })
    expect(getResizedImageDimensions(1200, 3600)).toEqual({ width: 600, height: 1800 })
    expect(getResizedImageDimensions(900, 500)).toEqual({ width: 900, height: 500 })
  })

  it("normalizes file names to webp", () => {
    expect(getWebpFileName("avatar.jpeg")).toBe("avatar.webp")
    expect(getWebpFileName("image")).toBe("image.webp")
    expect(getWebpFileName(".jpg")).toBe("image.webp")
  })

  it("resizes and encodes images as webp files", async () => {
    const bitmap = stubDecodedImage(3600, 2400)
    const original = new File(["original"], "landscape.jpeg", {
      type: "image/jpeg",
      lastModified: 1234
    })

    const converted = await resizeImageToWebp(original)

    expect(converted.name).toBe("landscape.webp")
    expect(converted.type).toBe(IMAGE_UPLOAD_WEBP_TYPE)
    expect(converted.lastModified).toBe(1234)
    expect(toBlobMimeType).toBe(IMAGE_UPLOAD_WEBP_TYPE)
    expect(toBlobQuality).toBe(IMAGE_UPLOAD_WEBP_QUALITY)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1800, 1200)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it("rejects when the browser cannot encode webp", async () => {
    const bitmap = stubDecodedImage(800, 600)
    toBlobResult = new Blob(["png"], { type: "image/png" })
    const original = new File(["original"], "photo.png", { type: "image/png" })

    await expect(resizeImageToWebp(original)).rejects.toThrow("WebP")
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})

describe("useImageUploaderProcessing", () => {
  function createUploader() {
    const uploader = {
      removeFile: vi.fn(),
      addFiles: vi.fn(),
      upload: vi.fn(),
      isAlive: vi.fn(() => true)
    }
    return uploader
  }

  it("removes originals, adds converted files, and starts upload", async () => {
    const uploader = createUploader()
    const uploaderRef = shallowRef(uploader as unknown as QUploader)
    const original = new File(["original"], "photo.jpg", { type: "image/jpeg" })
    const converted = new File(["converted"], "photo.webp", { type: IMAGE_UPLOAD_WEBP_TYPE })
    let resolveTransform: (file: File) => void = () => {}
    const transformFile = vi.fn(() => new Promise<File>(resolve => { resolveTransform = resolve }))

    const { isProcessing, handleAdded } = useImageUploaderProcessing({
      uploader: uploaderRef,
      transformFile
    })

    const processing = handleAdded([original])

    expect(uploader.removeFile).toHaveBeenCalledWith(original)
    expect(isProcessing.value).toBe(true)

    resolveTransform(converted)
    await processing

    expect(transformFile).toHaveBeenCalledWith(original)
    expect(uploader.addFiles).toHaveBeenCalledWith([converted])
    expect(uploader.upload).toHaveBeenCalledOnce()
    expect(isProcessing.value).toBe(false)
  })

  it("does not reprocess generated files emitted by QUploader", async () => {
    const uploader = createUploader()
    const uploaderRef = shallowRef(uploader as unknown as QUploader)
    const original = new File(["original"], "photo.jpg", { type: "image/jpeg" })
    const converted = new File(["converted"], "photo.webp", { type: IMAGE_UPLOAD_WEBP_TYPE })
    const transformFile = vi.fn(async () => converted)

    const { handleAdded } = useImageUploaderProcessing({ uploader: uploaderRef, transformFile })

    await handleAdded([original])
    vi.clearAllMocks()
    await handleAdded([converted])

    expect(transformFile).not.toHaveBeenCalled()
    expect(uploader.removeFile).not.toHaveBeenCalled()
    expect(uploader.addFiles).not.toHaveBeenCalled()
    expect(uploader.upload).not.toHaveBeenCalled()
  })

  it("notifies and skips upload when conversion fails", async () => {
    const uploader = createUploader()
    const uploaderRef = shallowRef(uploader as unknown as QUploader)
    const original = new File(["original"], "photo.jpg", { type: "image/jpeg" })
    const notifyError = vi.fn()
    const transformFile = vi.fn(async () => {
      throw new Error("decode failed")
    })

    const { handleAdded } = useImageUploaderProcessing({
      uploader: uploaderRef,
      transformFile,
      notifyError
    })

    await handleAdded([original])

    expect(uploader.removeFile).toHaveBeenCalledWith(original)
    expect(notifyError).toHaveBeenCalledOnce()
    expect(uploader.addFiles).not.toHaveBeenCalled()
    expect(uploader.upload).not.toHaveBeenCalled()
  })

  it("uploads converted files that succeeded when only part of a batch fails", async () => {
    const uploader = createUploader()
    const uploaderRef = shallowRef(uploader as unknown as QUploader)
    const good = new File(["good"], "good.jpg", { type: "image/jpeg" })
    const bad = new File(["bad"], "bad.jpg", { type: "image/jpeg" })
    const converted = new File(["converted"], "good.webp", { type: IMAGE_UPLOAD_WEBP_TYPE })
    const notifyError = vi.fn()
    const transformFile = vi.fn(async (file: File) => {
      if (file === bad) {
        throw new Error("decode failed")
      }
      return converted
    })

    const { handleAdded } = useImageUploaderProcessing({
      uploader: uploaderRef,
      transformFile,
      notifyError
    })

    await handleAdded([good, bad])

    expect(uploader.removeFile).toHaveBeenCalledWith(good)
    expect(uploader.removeFile).toHaveBeenCalledWith(bad)
    expect(notifyError).toHaveBeenCalledOnce()
    expect(uploader.addFiles).toHaveBeenCalledWith([converted])
    expect(uploader.upload).toHaveBeenCalledOnce()
  })
})

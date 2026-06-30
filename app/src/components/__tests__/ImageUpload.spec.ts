import {
  IMAGE_UPLOAD_JPEG_QUALITY,
  IMAGE_UPLOAD_JPEG_TYPE,
  IMAGE_UPLOAD_WEBP_QUALITY,
  IMAGE_UPLOAD_WEBP_TYPE,
  getResizedImageDimensions,
  getUploadImageFileName,
  resizeImageToWebp
} from "src/utils/imageUpload"

interface MockImageBitmap {
  width: number
  height: number
  close: ReturnType<typeof vi.fn>
}

const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext")
const originalToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob")

let drawImage: ReturnType<typeof vi.fn>
let toBlobResults: (Blob | null)[]
let toBlobMimeType: string | undefined
let toBlobQuality: number | undefined

function installCanvasMocks() {
  drawImage = vi.fn()
  toBlobResults = [new Blob(["webp"], { type: IMAGE_UPLOAD_WEBP_TYPE })]
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
      callback(toBlobResults.shift() ?? null)
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

function stubFailingFallbackDecode() {
  const objectUrl = "blob:failed"
  const createObjectURL = vi.fn(() => objectUrl)
  const revokeObjectURL = vi.fn()

  class FailingImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null

    set src(_value: string) {
      this.onerror?.()
    }
  }

  vi.stubGlobal("createImageBitmap", vi.fn(async () => {
    throw new Error("Bitmap decoding failed")
  }))
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL,
    revokeObjectURL
  })
  vi.stubGlobal("Image", FailingImage)

  return { createObjectURL, objectUrl, revokeObjectURL }
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

  it("normalizes upload image file names", () => {
    expect(getUploadImageFileName("avatar.jpeg", IMAGE_UPLOAD_WEBP_TYPE)).toBe("avatar.webp")
    expect(getUploadImageFileName("image", IMAGE_UPLOAD_WEBP_TYPE)).toBe("image.webp")
    expect(getUploadImageFileName(".jpg", IMAGE_UPLOAD_WEBP_TYPE)).toBe("image.webp")
    expect(getUploadImageFileName("avatar.jpeg", IMAGE_UPLOAD_JPEG_TYPE)).toBe("avatar.jpg")
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

  it("falls back to jpeg when the browser cannot encode webp", async () => {
    const bitmap = stubDecodedImage(800, 600)
    toBlobResults = [
      new Blob(["png"], { type: "image/png" }),
      new Blob(["jpeg"], { type: IMAGE_UPLOAD_JPEG_TYPE })
    ]
    const original = new File(["original"], "photo.png", { type: "image/png" })

    const converted = await resizeImageToWebp(original)

    expect(converted.name).toBe("photo.jpg")
    expect(converted.type).toBe(IMAGE_UPLOAD_JPEG_TYPE)
    expect(toBlobMimeType).toBe(IMAGE_UPLOAD_JPEG_TYPE)
    expect(toBlobQuality).toBe(IMAGE_UPLOAD_JPEG_QUALITY)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it("revokes fallback object urls when image decoding fails", async () => {
    const { createObjectURL, objectUrl, revokeObjectURL } = stubFailingFallbackDecode()
    const original = new File(["original"], "broken.jpg", { type: "image/jpeg" })

    await expect(resizeImageToWebp(original)).rejects.toThrow("decode image")
    expect(createObjectURL).toHaveBeenCalledWith(original)
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl)
  })
})

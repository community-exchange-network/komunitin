import { vi } from "vitest"
import { IMAGE_UPLOAD_WEBP_TYPE } from "src/utils/imageUpload"

interface MockImageFile extends File {
  __mockEncodedSize?: number
  __mockHeight?: number
  __mockWidth?: number
}

interface MockImageOptions {
  encodedSize?: number
  height: number
  lastModified?: number
  name: string
  size: number
  type: string
  width: number
}

export const createMockImageFile = ({
  encodedSize = 180_000,
  height,
  lastModified = 123,
  name,
  size,
  type,
  width
}: MockImageOptions) => {
  const file = new File([new Uint8Array(size)], name, { type, lastModified }) as MockImageFile
  file.__mockEncodedSize = encodedSize
  file.__mockHeight = height
  file.__mockWidth = width
  return file
}

export const mockImageUploadProcessing = () => {
  const originalCreateElement = document.createElement.bind(document)
  let encodedSize = 0

  vi.stubGlobal("createImageBitmap", vi.fn(async (file: MockImageFile) => {
    encodedSize = file.__mockEncodedSize ?? 0
    return {
      close: vi.fn(),
      height: file.__mockHeight ?? 1,
      width: file.__mockWidth ?? 1
    } as ImageBitmap
  }))

  vi.spyOn(document, "createElement").mockImplementation((tagName: string, options?: ElementCreationOptions) => {
    if (tagName.toLowerCase() !== "canvas") {
      return originalCreateElement(tagName, options)
    }

    return {
      height: 0,
      width: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: (callback: BlobCallback, type?: string) => {
        callback(new Blob([new Uint8Array(encodedSize)], { type: type ?? IMAGE_UPLOAD_WEBP_TYPE }))
      }
    } as unknown as HTMLCanvasElement
  })
}

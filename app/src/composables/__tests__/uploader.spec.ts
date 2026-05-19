import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { transformImageFile } from '../uploader'

describe('transformImageFile', () => {
  const originalCreateElement = document.createElement.bind(document)
  const createCanvasMock = (width: number, height: number) => {
    const drawImage = vi.fn()
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(['webp'], { type: 'image/webp' }))
    })

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width,
          height,
          getContext: vi.fn(() => ({ drawImage })),
          toBlob
        } as unknown as HTMLCanvasElement
      }

      return originalCreateElement(tagName)
    })

    return { drawImage, toBlob }
  }

  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 4000,
      height: 2000,
      close: vi.fn()
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('resizes large images to 1800px and converts them to webp', async () => {
    const { drawImage } = createCanvasMock(1800, 900)
    const file = new File(['raw-image'], 'big-photo.jpg', { type: 'image/jpeg', lastModified: 123 })

    const transformed = await transformImageFile(file)

    expect(transformed.name).toBe('big-photo.webp')
    expect(transformed.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1800, 900)
  })

  it('keeps smaller images dimensions while still converting to webp', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 1200,
      height: 800,
      close: vi.fn()
    }))

    const { drawImage } = createCanvasMock(1200, 800)
    const file = new File(['raw-image'], 'small.png', { type: 'image/png', lastModified: 456 })

    const transformed = await transformImageFile(file)

    expect(transformed.name).toBe('small.webp')
    expect(transformed.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1200, 800)
  })
})

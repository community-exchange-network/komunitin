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
    const { drawImage, toBlob } = createCanvasMock(1800, 900)
    const file = new File(['raw-image'], 'big-photo.jpg', { type: 'image/jpeg', lastModified: 123 })

    const transformed = await transformImageFile(file)

    expect(transformed.name).toBe('big-photo.webp')
    expect(transformed.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1800, 900)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82)
  })

  it('keeps smaller images dimensions while still converting to webp', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 1200,
      height: 800,
      close: vi.fn()
    }))

    const { drawImage, toBlob } = createCanvasMock(1200, 800)
    const file = new File(['raw-image'], 'small.png', { type: 'image/png', lastModified: 456 })

    const transformed = await transformImageFile(file)

    expect(transformed.name).toBe('small.webp')
    expect(transformed.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1200, 800)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82)
  })

  it('throws when webp encoding fails', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({ drawImage: vi.fn() })),
          toBlob: (callback: BlobCallback) => callback(null)
        } as unknown as HTMLCanvasElement
      }

      return originalCreateElement(tagName)
    })

    const file = new File(['raw-image'], 'broken.jpg', { type: 'image/jpeg' })

    await expect(transformImageFile(file)).rejects.toThrow('Could not encode image')
  })

  it('falls back to Image decoding when createImageBitmap is unavailable', async () => {
    const revokeObjectURL = vi.fn()
    const { drawImage } = createCanvasMock(1000, 500)

    vi.stubGlobal('createImageBitmap', undefined)
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:fallback-image')
    })
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL
    })

    class MockImage {
      public height = 500
      public naturalHeight = 500
      public naturalWidth = 1000
      public onerror: null | (() => void) = null
      public onload: null | (() => void) = null
      public width = 1000

      set src(_value: string) {
        this.onload?.()
      }
    }

    vi.stubGlobal('Image', MockImage as unknown as typeof Image)

    const file = new File(['raw-image'], 'fallback.png', { type: 'image/png', lastModified: 789 })
    const transformed = await transformImageFile(file)

    expect(transformed.name).toBe('fallback.webp')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1000, 500)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fallback-image')
  })
})

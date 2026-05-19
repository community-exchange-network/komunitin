import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import ImageField from '../ImageField.vue'
import AvatarField from '../AvatarField.vue'
import { mountComponent, waitFor } from '../../../test/vitest/utils'

class MockFormData {
  public entries: { filename?: string, name: string, value: File }[] = []

  public append(name: string, value: string | Blob, filename?: string) {
    this.entries.push({ name, value: value as File, filename })
  }
}

class MockUploadTarget {
  private listeners: Record<string, ((event: { loaded: number }) => void)[]> = {}

  public addEventListener(type: string, listener: (event: { loaded: number }) => void) {
    this.listeners[type] ??= []
    this.listeners[type].push(listener)
  }

  public dispatch(type: string, event: { loaded: number }) {
    this.listeners[type]?.forEach(listener => listener(event))
  }
}

class MockXMLHttpRequest {
  public static instances: MockXMLHttpRequest[] = []

  public readonly upload = new MockUploadTarget()
  public readonly headers: { name: string, value: string }[] = []
  public body?: MockFormData
  public responseText = ''
  public status = 0

  private listeners: Record<string, (() => void)[]> = {}

  constructor() {
    MockXMLHttpRequest.instances.push(this)
  }

  public addEventListener(type: string, listener: () => void) {
    this.listeners[type] ??= []
    this.listeners[type].push(listener)
  }

  public open(method: string, url: string) {
    void method
    void url
    return
  }

  public setRequestHeader(name: string, value: string) {
    this.headers.push({ name, value })
  }

  public send(body: MockFormData) {
    this.body = body
    const uploadedFile = body.entries[0].value

    this.upload.dispatch('progress', { loaded: uploadedFile.size })
    this.status = 201
    this.responseText = JSON.stringify({
      data: {
        attributes: {
          url: `https://files.example/${uploadedFile.name}`
        }
      }
    })

    this.listeners.load?.forEach(listener => listener())
  }

  public abort() {
    this.listeners.abort?.forEach(listener => listener())
  }
}

describe('image upload fields', () => {
  const originalCreateElement = document.createElement.bind(document)

  const setupCanvas = () => {
    const drawImage = vi.fn()

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({ drawImage })),
          toBlob: (callback: BlobCallback) => callback(new Blob(['webp'], { type: 'image/webp' }))
        } as unknown as HTMLCanvasElement
      }

      return originalCreateElement(tagName)
    })

    return { drawImage }
  }

  const getUploader = (wrapper: VueWrapper) => {
    return wrapper.getComponent({ name: 'QUploader' }).vm as unknown as {
      addFiles: (files: File[]) => void
    }
  }

  beforeEach(() => {
    MockXMLHttpRequest.instances = []
    vi.stubGlobal('FormData', MockFormData as unknown as typeof FormData)
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 3600,
      height: 2400,
      close: vi.fn()
    }))

    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:preview')
    })
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uploads resized webp files from ImageField', async () => {
    const { drawImage } = setupCanvas()
    const wrapper = await mountComponent(ImageField, {
      props: {
        modelValue: [],
        label: 'Add images',
        hint: 'hint'
      },
      login: true
    })

    getUploader(wrapper).addFiles([
      new File(['raw'], 'offer-photo.jpg', { type: 'image/jpeg', lastModified: 123 })
    ])

    await waitFor(() => MockXMLHttpRequest.instances.length, 1, 'Upload should start')
    await waitFor(
      () => wrapper.emitted('update:modelValue')?.at(-1)?.[0]?.[0],
      'https://files.example/offer-photo.webp',
      'ImageField should emit the uploaded image url'
    )

    const uploadedFile = MockXMLHttpRequest.instances[0].body?.entries[0].value

    expect(uploadedFile?.name).toBe('offer-photo.webp')
    expect(uploadedFile?.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1800, 1200)
    wrapper.unmount()
  })

  it('uploads resized webp files from AvatarField', async () => {
    setupCanvas()
    const wrapper = await mountComponent(AvatarField, {
      props: {
        modelValue: null,
        text: 'Avatar'
      },
      login: true
    })

    getUploader(wrapper).addFiles([
      new File(['raw'], 'avatar.png', { type: 'image/png', lastModified: 456 })
    ])

    await waitFor(() => MockXMLHttpRequest.instances.length, 1, 'Avatar upload should start')
    await waitFor(
      () => wrapper.emitted('update:modelValue')?.at(-1)?.[0],
      'https://files.example/avatar.webp',
      'AvatarField should emit the uploaded avatar url'
    )

    const uploadedFile = MockXMLHttpRequest.instances[0].body?.entries[0].value

    expect(uploadedFile?.name).toBe('avatar.webp')
    expect(uploadedFile?.type).toBe('image/webp')
    wrapper.unmount()
  })
})

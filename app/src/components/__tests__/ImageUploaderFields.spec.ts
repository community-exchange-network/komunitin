import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AvatarField from "../AvatarField.vue"
import ImageField from "../ImageField.vue"
import {
  getMockFileUploadAttempts,
  resetMockFileUploads,
  setMockFileUploadLimit
} from "src/server/FilesServer"
import { mountComponent, waitFor } from "../../../test/vitest/utils"
import { createMockImageFile, mockImageUploadProcessing } from "../../../test/vitest/utils/mockImageUpload"

type MountedComponent = Awaited<ReturnType<typeof mountComponent>>

const lastUploadedImageUrl = (wrapper: MountedComponent) => {
  const modelUpdateEvents: [string[]][] = wrapper.emitted("update:modelValue") ?? []
  const lastImageUrls = modelUpdateEvents.at(-1)?.[0]
  return lastImageUrls?.at(-1)
}

const uploadFile = async (wrapper: MountedComponent, file: File) => {
  const input = wrapper.get("input[type='file']")
  Object.defineProperty(input.element, "files", {
    configurable: true,
    value: [file]
  })
  await input.trigger("change")
}

describe("image upload fields", () => {
  beforeEach(() => {
    resetMockFileUploads()
    mockImageUploadProcessing()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("uploads a resized image from ImageField before the mock files endpoint would reject the original", async () => {
    const uploadLimit = 250_000
    const originalImage = createMockImageFile({
      encodedSize: 180_000,
      height: 2400,
      name: "offer-photo.jpg",
      size: 1_100_000,
      type: "image/jpeg",
      width: 3600
    })

    setMockFileUploadLimit(uploadLimit)
    const wrapper = await mountComponent(ImageField, {
      props: {
        modelValue: [],
        label: "Add images",
        hint: "hint"
      },
      login: true
    })

    await uploadFile(wrapper, originalImage)

    await waitFor(
      () => lastUploadedImageUrl(wrapper),
      "https://files.example/offer-photo.webp",
      "ImageField should emit the uploaded image url"
    )

    const [upload] = getMockFileUploadAttempts()
    expect(originalImage.size).toBeGreaterThan(uploadLimit)
    expect(upload).toMatchObject({
      accepted: true,
      name: "offer-photo.webp",
      type: "image/webp",
      url: "https://files.example/offer-photo.webp"
    })
    expect(upload.size).toBeLessThanOrEqual(uploadLimit)
    wrapper.unmount()
  })

  it("keeps AvatarField unchanged when the mocked endpoint rejects the transformed image as too large", async () => {
    setMockFileUploadLimit(100_000)
    const wrapper = await mountComponent(AvatarField, {
      props: {
        modelValue: null,
        text: "Avatar"
      },
      login: true
    })

    await uploadFile(wrapper, createMockImageFile({
      encodedSize: 180_000,
      height: 2400,
      name: "avatar.png",
      size: 1_100_000,
      type: "image/png",
      width: 3600
    }))

    await waitFor(
      () => getMockFileUploadAttempts().length,
      1,
      "Avatar upload should reach the mock files endpoint"
    )

    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    expect(getMockFileUploadAttempts()[0]).toMatchObject({
      accepted: false,
      name: "avatar.webp",
      type: "image/webp"
    })
    wrapper.unmount()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Notify, type QUploader } from "quasar"
import { defineComponent, shallowRef } from "vue"
import Avatar from "../Avatar.vue"
import AvatarField from "../AvatarField.vue"
import ImageField from "../ImageField.vue"
import { useImageUploader } from "src/composables/uploader"
import {
  getMockFileUploadAttempts,
  resetMockFileUploads,
  setMockFileUploadLimit
} from "src/server/FilesServer"
import { mountComponent, waitFor } from "../../../test/vitest/utils"
import { createMockImageFile, mockImageUploadProcessing } from "../../../test/vitest/utils/mockImageUpload"

type MountedComponent = Awaited<ReturnType<typeof mountComponent>>

const lastUploadedImageUrl = (wrapper: MountedComponent) => {
  const modelUpdateEvents: [{url: string}[]][] = wrapper.emitted("update:modelValue") ?? []
  const lastImages = modelUpdateEvents.at(-1)?.[0]
  return lastImages?.at(-1)?.url
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
    let imageDecoded = false
    const decodeImage = vi.mocked(createImageBitmap).getMockImplementation()
    vi.mocked(createImageBitmap).mockImplementation(async file => {
      const image = await decodeImage(file)
      imageDecoded = true
      return image
    })
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image-preview")
    const revokePreview = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
      expect(imageDecoded).toBe(true)
    })
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
        hint: "hint",
        code: "GRP0",
        resourceType: "offers"
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
    expect(revokePreview).toHaveBeenCalled()
    wrapper.unmount()
  })

  it("keeps AvatarField unchanged when the mocked endpoint rejects the transformed image as too large", async () => {
    setMockFileUploadLimit(100_000)
    const wrapper = await mountComponent(AvatarField, {
      props: {
        modelValue: null,
        text: "Avatar",
        code: "GRP0",
        resourceType: "members"
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

  it("defers an AvatarField upload until requested and uses the latest group code", async () => {
    const wrapper = await mountComponent(AvatarField, {
      props: {
        modelValue: null,
        text: "New group",
        code: "",
        resourceType: "groups",
        deferred: true
      },
      login: true
    })

    await uploadFile(wrapper, createMockImageFile({
      height: 800,
      name: "new-group.png",
      size: 200_000,
      type: "image/png",
      width: 800
    }))

    await waitFor(
      () => wrapper.getComponent(Avatar).props("imgSrc")?.url?.startsWith("blob:"),
      true,
      "Deferred avatar should show a local preview"
    )
    expect(getMockFileUploadAttempts()).toHaveLength(0)

    await wrapper.setProps({ code: "NEW1" })
    const avatarField = wrapper.vm as unknown as {
      upload: () => Promise<{ url: string } | null>
    }
    const image = await avatarField.upload()

    expect(image).toEqual({ url: "https://files.example/new-group.webp" })
    expect(getMockFileUploadAttempts()).toEqual([
      expect.objectContaining({
        accepted: true,
        name: "new-group.webp",
        tenantCode: "NEW1"
      })
    ])

    const repeatedImage = await avatarField.upload()
    expect(repeatedImage).toEqual(image)
    expect(getMockFileUploadAttempts()).toHaveLength(1)
    wrapper.unmount()
  })

  it("resolves a deferred upload after every request finishes", async () => {
    const firstFile = new File(["first"], "first.webp", { type: "image/webp" })
    const secondFile = new File(["second"], "second.webp", { type: "image/webp" })
    const activeUploader = {
      queuedFiles: [firstFile, secondFile],
      upload: vi.fn(),
      removeUploadedFiles: vi.fn(),
      removeFile: vi.fn()
    } as unknown as QUploader
    const onUploaded = vi.fn()
    let imageUploader!: ReturnType<typeof useImageUploader>

    const Harness = defineComponent({
      setup() {
        imageUploader = useImageUploader({
          uploader: shallowRef(activeUploader),
          code: "GRP0",
          resourceType: "offers",
          deferred: true,
          onUploaded
        })
        return () => null
      }
    })
    const wrapper = await mountComponent(Harness, { login: true })
    let result: boolean | undefined
    const upload = imageUploader.upload().then(value => {
      result = value
      return value
    })

    await waitFor(() => activeUploader.upload.mock.calls.length, 1)
    imageUploader.uploaderEvents.uploaded({
      xhr: {
        responseText: JSON.stringify({
          data: { attributes: { url: "https://files.example/first.webp" } }
        })
      } as XMLHttpRequest
    })
    imageUploader.uploaderEvents.failed({ files: [secondFile] })
    await Promise.resolve()

    expect(result).toBeUndefined()
    expect(activeUploader.removeFile).not.toHaveBeenCalled()

    imageUploader.uploaderEvents.finish()
    expect(await upload).toBe(false)
    expect(onUploaded).toHaveBeenCalledWith({
      url: "https://files.example/first.webp"
    })
    wrapper.unmount()
  })

  it("removes ImageField item and notifies when the server rejects the upload", async () => {
    setMockFileUploadLimit(100_000)
    const wrapper = await mountComponent(ImageField, {
      props: {
        modelValue: [],
        label: "Add images",
        hint: "hint",
        code: "GRP0",
        resourceType: "needs"
      },
      login: true
    })

    await uploadFile(wrapper, createMockImageFile({
      encodedSize: 180_000,
      height: 2400,
      name: "too-large.jpg",
      size: 1_100_000,
      type: "image/jpeg",
      width: 3600
    }))

    await waitFor(
      () => getMockFileUploadAttempts().length,
      1,
      "ImageField upload should reach the mock files endpoint"
    )

    await waitFor(
      () => wrapper.findAll(".image-field-item").length,
      0,
      "ImageField should remove the rejected upload item"
    )

    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    expect(Notify.create).toHaveBeenCalledWith({
      type: "negative",
      message: "Could not upload image. Please choose another image."
    })
    wrapper.unmount()
  })
})
